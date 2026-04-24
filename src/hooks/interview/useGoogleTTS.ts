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
}

/**
 * Google Cloud Text-to-Speech via backend.
 * Backend calls Google TTS API and returns base64 MP3.
 * Voice: en-IN-Wavenet-A (Indian female).
 */
export function useGoogleTTS(language: string = "en"): SpeechSynthesisHook {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLipSyncing, setIsLipSyncing] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakingRef = useRef(false);
  const langRef = useRef(language);
  langRef.current = language;
  const pendingTextRef = useRef<string | null>(null);

  const isSupported = typeof window !== "undefined" && typeof Audio !== "undefined";

  const cancel = useCallback(() => {
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
      speakingRef.current = true;
      // isSpeaking goes true immediately so the interview state machine
      // (which gates SPEAKING → LISTENING on isSpeaking) doesn't transition
      // away during the fetch/decode window.
      setIsSpeaking(true);

      try {
        const audioB64 = await fetchTTS(text);
        if (!speakingRef.current) return;

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
          if (speakingRef.current) setIsLipSyncing(true);
        };

        audio.onended = () => {
          speakingRef.current = false;
          setIsSpeaking(false);
          setIsLipSyncing(false);
          audioRef.current = null;
          setAudioElement(null);
        };

        audio.onerror = () => {
          speakingRef.current = false;
          setIsSpeaking(false);
          setIsLipSyncing(false);
          audioRef.current = null;
          setAudioElement(null);
        };

        try {
          await audio.play();
        } catch (err: any) {
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
    const unlock = () => {
      if (pendingTextRef.current) {
        const text = pendingTextRef.current;
        pendingTextRef.current = null;
        setTimeout(() => speak(text), 100);
      }
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
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

  return { speak, cancel, isSpeaking, isLipSyncing, audioElement, isSupported };
}
