"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

interface SpeechSynthesisHook {
  speak: (text: string) => void;
  cancel: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
}

/**
 * Google Cloud Text-to-Speech via backend.
 * Backend calls Google TTS API and returns base64 MP3.
 * Voice: en-IN-Wavenet-A (Indian female).
 */
export function useGoogleTTS(language: string = "en"): SpeechSynthesisHook {
  const [isSpeaking, setIsSpeaking] = useState(false);
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
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!isSupported || !text.trim()) return;

      cancel();
      speakingRef.current = true;
      setIsSpeaking(true);

      try {
        const res = await fetch(`${API_BASE}/interview/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim(), language: langRef.current }),
        });

        if (!res.ok) throw new Error(`TTS API error: ${res.status}`);

        const data = await res.json();
        if (!data.audio) throw new Error("No audio in response");
        if (!speakingRef.current) return;

        const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
        audio.volume = 1.0;
        audioRef.current = audio;

        audio.onended = () => {
          speakingRef.current = false;
          setIsSpeaking(false);
          audioRef.current = null;
        };

        audio.onerror = () => {
          speakingRef.current = false;
          setIsSpeaking(false);
          audioRef.current = null;
        };

        try {
          await audio.play();
        } catch (err: any) {
          if (err.name === "NotAllowedError") {
            console.log("[GoogleTTS] Autoplay blocked — saving for retry on click");
            pendingTextRef.current = text;
            speakingRef.current = false;
            setIsSpeaking(false);
            audioRef.current = null;
          } else {
            throw err;
          }
        }
      } catch (err) {
        console.error("[GoogleTTS] Failed:", err);
        speakingRef.current = false;
        setIsSpeaking(false);
        // Fallback to browser TTS if Google fails
        try {
          if ("speechSynthesis" in window) {
            const utt = new SpeechSynthesisUtterance(text);
            utt.rate = 0.95;
            utt.pitch = 1.1;
            window.speechSynthesis.speak(utt);
            setIsSpeaking(true);
            utt.onend = () => setIsSpeaking(false);
            utt.onerror = () => setIsSpeaking(false);
          }
        } catch {}
      }
    },
    [isSupported, cancel]
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

  return { speak, cancel, isSpeaking, isSupported };
}
