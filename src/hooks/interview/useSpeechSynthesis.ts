"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechSynthesisHook {
  speak: (text: string) => void;
  cancel: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
}

/**
 * Chrome has a known bug where SpeechSynthesisUtterance.onend never fires
 * for long texts. We use a watchdog timer that force-cancels TTS if it
 * exceeds the expected duration.
 */
const WATCHDOG_MARGIN_MS = 3000; // extra margin beyond estimated duration
const CHARS_PER_SECOND = 14; // conservative estimate for TTS at rate 0.95

export function useSpeechSynthesis(): SpeechSynthesisHook {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!isSupported) return;

    const loadVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      // Prefer a natural-sounding English voice
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Samantha"))
      );
      voiceRef.current = preferred || voices.find((v) => v.lang.startsWith("en")) || null;
    };

    loadVoice();
    window.speechSynthesis.onvoiceschanged = loadVoice;
  }, [isSupported]);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !text) return;
      window.speechSynthesis.cancel();
      clearWatchdog();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      if (voiceRef.current) utterance.voice = voiceRef.current;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        clearWatchdog();
        setIsSpeaking(false);
      };
      utterance.onerror = () => {
        clearWatchdog();
        setIsSpeaking(false);
      };

      utteranceRef.current = utterance;
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);

      // Watchdog: if onend never fires (Chrome bug), force-cancel after
      // estimated duration + margin so the system never gets stuck.
      const estimatedMs = (text.length / CHARS_PER_SECOND) * 1000 + WATCHDOG_MARGIN_MS;
      watchdogRef.current = setTimeout(() => {
        if (window.speechSynthesis.speaking) {
          console.warn("[TTS Watchdog] Force-cancelling stuck TTS after", estimatedMs, "ms");
          window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);
      }, estimatedMs);
    },
    [isSupported, clearWatchdog]
  );

  const cancel = useCallback(() => {
    if (!isSupported) return;
    clearWatchdog();
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported, clearWatchdog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    };
  }, []);

  return { speak, cancel, isSpeaking, isSupported };
}
