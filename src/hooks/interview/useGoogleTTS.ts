"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

interface SpeechSynthesisHook {
  speak: (text: string) => void;
  cancel: () => void;
  /** True from the moment speak() is called until audio ends. Drives the
   *  interview state machine (gates SPEAKING → LISTENING). */
  isSpeaking: boolean;
  /** True only while audio is actually playing through the speakers. Drives
   *  the avatar visemes so lip-sync matches the voice. */
  isLipSyncing: boolean;
  /** Currently playing TTS audio element. Exposed so a visualizer can wrap
   *  it in a Web Audio AnalyserNode for real-time amplitude data. Null
   *  whenever nothing is playing. */
  audioElement: HTMLAudioElement | null;
  isSupported: boolean;
  /** Non-null when the last TTS request failed after all retries — the AI
   *  question was NOT spoken. The UI should tell the candidate to read the
   *  question on screen instead of degrading silently. Cleared on the next
   *  successful speak(). */
  error: string | null;
}

/**
 * Strip markdown / code-formatting characters so the voice doesn't read them
 * aloud. The model formats terms like `useState` or **bold**; without this, TTS
 * literally pronounces the backticks, tildes, asterisks, etc. Only the SPOKEN
 * text is cleaned — the on-screen transcript keeps the original formatting.
 */
function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")        // fenced code blocks → drop
    .replace(/`/g, "")                        // inline code backticks: `useState` → useState
    .replace(/~~/g, "")                       // strikethrough
    .replace(/(\*\*|\*|__|_)/g, "")           // bold / italic markers
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")       // markdown headings
    .replace(/^\s{0,3}>\s?/gm, "")            // blockquotes
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")  // links [text](url) → text
    .replace(/[*_~#`]/g, "")                  // any stray markdown chars left
    .replace(/\s{2,}/g, " ")                  // collapse whitespace
    .trim();
}

/**
 * Google Cloud Text-to-Speech via backend.
 * Backend calls Google TTS API and returns base64 MP3.
 * Voice: en-IN-Wavenet-A (Indian female).
 */
export function useGoogleTTS(language: string = "en"): SpeechSynthesisHook {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLipSyncing, setIsLipSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakingRef = useRef(false);
  const langRef = useRef(language);
  langRef.current = language;
  const pendingTextRef = useRef<string | null>(null);
  // Monotonic token: each speak()/cancel() invalidates older in-flight calls.
  // Without it, two rapid speak() calls (e.g. a local fallback message followed
  // by the real AI reply) both pass the speakingRef check after their fetches
  // resolve and play two overlapping audios.
  const generationRef = useRef(0);

  const isSupported = typeof window !== "undefined" && typeof Audio !== "undefined";

  const cancel = useCallback(() => {
    generationRef.current += 1;
    speakingRef.current = false;
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {}
      audioRef.current = null;
    }
    setAudioElement(null);
    setIsSpeaking(false);
    setIsLipSyncing(false);
  }, []);

  const fetchTTS = useCallback(async (text: string): Promise<string> => {
    // Retry Google TTS up to 3 times with backoff before giving up.
    // We never fall back to browser speechSynthesis — that swaps the voice
    // mid-interview, which candidates have flagged. Better to silently retry
    // and stay on the same Indian female voice every time.
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${API_BASE}/interview/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim(), language: langRef.current }),
        });
        if (!res.ok) throw new Error(`TTS API error: ${res.status}`);
        const data = await res.json();
        if (!data.audio) throw new Error("No audio in response");
        return data.audio as string;
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
    }
    throw lastErr ?? new Error("TTS failed");
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!isSupported || !text.trim()) return;

      cancel();
      const gen = ++generationRef.current;
      speakingRef.current = true;
      // isSpeaking goes true immediately so the interview state machine
      // (which gates SPEAKING → LISTENING on isSpeaking) doesn't transition
      // away during the fetch/decode window.
      setIsSpeaking(true);

      try {
        // Speak the cleaned text (no markdown/code symbols); the displayed
        // transcript still shows the original formatting.
        const audioB64 = await fetchTTS(cleanForSpeech(text));
        if (gen !== generationRef.current || !speakingRef.current) return;
        setError(null);

        const audio = new Audio(`data:audio/mp3;base64,${audioB64}`);
        audio.volume = 1.0;
        // crossOrigin needed so MediaElementAudioSourceNode can read the
        // audio data (data: URIs are fine, but setting this keeps us safe
        // if the source ever changes to an HTTP URL).
        audio.crossOrigin = "anonymous";
        audioRef.current = audio;
        setAudioElement(audio);

        // isLipSyncing flips only when audio actually plays — keeps the
        // avatar's mouth in sync with the voice, regardless of network/decode
        // latency.
        audio.onplaying = () => {
          if (gen === generationRef.current && speakingRef.current) setIsLipSyncing(true);
        };

        const onAudioDone = () => {
          // Guard against callbacks firing after cancel() / a newer speak():
          // if speakingRef is false or the generation moved on, cleanup is
          // someone else's responsibility.
          if (gen !== generationRef.current) return;
          if (!speakingRef.current) return;
          speakingRef.current = false;
          setIsSpeaking(false);
          setIsLipSyncing(false);
          audioRef.current = null;
          setAudioElement(null);
        };
        audio.onended = onAudioDone;
        audio.onerror = onAudioDone;

        try {
          await audio.play();
        } catch (err: any) {
          if (gen !== generationRef.current) return;
          if (err.name === "NotAllowedError") {
            console.log("[GoogleTTS] Autoplay blocked — saving for retry on click");
            pendingTextRef.current = text;
            speakingRef.current = false;
            setIsSpeaking(false);
            setIsLipSyncing(false);
            audioRef.current = null;
            setAudioElement(null);
          } else {
            throw err;
          }
        }
      } catch (err) {
        console.error("[GoogleTTS] Failed after retries:", err);
        if (gen !== generationRef.current) return;
        setError(
          "The AI voice is temporarily unavailable — please read the question in the chat panel and answer normally."
        );
        speakingRef.current = false;
        setIsSpeaking(false);
        setIsLipSyncing(false);
        setAudioElement(null);
      }
    },
    [isSupported, cancel, fetchTTS]
  );

  // Unlock autoplay on first user interaction — retry pending speech
  useEffect(() => {
    if (!isSupported) return;
    // Persistent listeners (NOT once): the first user click usually happens
    // before any TTS is blocked, which used to consume the once-listeners and
    // leave a later blocked playback with no retry path — the AI went silent
    // for the rest of the interview. Keeping them armed costs nothing.
    const unlock = () => {
      if (pendingTextRef.current) {
        const text = pendingTextRef.current;
        pendingTextRef.current = null;
        setTimeout(() => speak(text), 100);
      }
    };
    window.addEventListener("click", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [isSupported, speak]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { cancel(); };
  }, [cancel]);

  return { speak, cancel, isSpeaking, isLipSyncing, audioElement, isSupported, error };
}
