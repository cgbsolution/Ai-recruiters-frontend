"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechSynthesisHook {
  speak: (text: string) => void;
  cancel: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
}

const CHARS_PER_SECOND = 14;
const WATCHDOG_MARGIN_MS = 4000;

/**
 * Split text into sentence-boundary chunks ≤ 200 chars.
 * Chrome silently truncates long utterances and has a known bug where
 * speechSynthesis stops working after ~15 min. Chunking prevents both.
 */
function splitIntoChunks(text: string): string[] {
  const raw = text.match(/[^.!?]+[.!?]*[\s]*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const s of raw) {
    if (current && (current + s).length > 200) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/**
 * Find the best Indian English female voice available in the browser.
 * Priority:
 * 1. en-IN female voices (Google, Microsoft Neural)
 * 2. Any en-IN voice
 * 3. Any female English voice with "Google" or "Natural" in name
 * 4. First English voice available
 */
function findBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  // Priority 1: Indian English female voices
  const indianFemale = voices.filter(
    (v) => v.lang === "en-IN" && /female|neerja|aditi|raveena/i.test(v.name)
  );
  if (indianFemale.length > 0) {
    // Prefer Google or Microsoft Neural
    return indianFemale.find((v) => /google|natural|neural|online/i.test(v.name)) || indianFemale[0];
  }

  // Priority 2: Any en-IN voice (even if gender unknown)
  const indian = voices.filter((v) => v.lang === "en-IN");
  if (indian.length > 0) {
    return indian.find((v) => /google|natural|neural/i.test(v.name)) || indian[0];
  }

  // Priority 3: English female voices with natural quality
  const englishFemale = voices.filter(
    (v) => v.lang.startsWith("en") && /female|samantha|karen|moira|fiona|google.*female/i.test(v.name)
  );
  if (englishFemale.length > 0) return englishFemale[0];

  // Priority 4: Any high-quality English voice (NOT male-sounding names)
  const maleNames = /daniel|james|david|thomas|aaron|guy|rishi|mark|lee|fred|alex|junior/i;
  const englishNonMale = voices.filter(
    (v) => v.lang.startsWith("en") && !maleNames.test(v.name) && /google|natural|neural/i.test(v.name)
  );
  if (englishNonMale.length > 0) return englishNonMale[0];

  // Priority 5: Any English voice, filtering out known male voices
  const anyEnglish = voices.filter((v) => v.lang.startsWith("en") && !maleNames.test(v.name));
  if (anyEnglish.length > 0) return anyEnglish[0];

  // Last resort
  return voices.find((v) => v.lang.startsWith("en")) || voices[0];
}

/**
 * Text-to-Speech hook using browser Web Speech API.
 * Selects Indian English female voice for natural accent.
 * Instant playback — perfectly synced with avatar lip-sync.
 */
export function useSpeechSynthesis(): SpeechSynthesisHook {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const queueRef = useRef<string[]>([]);
  const activeRef = useRef<SpeechSynthesisUtterance | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const voicesLoadedRef = useRef(false);

  // Load voices — may happen async in some browsers
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        voiceRef.current = findBestVoice(voices);
        voicesLoadedRef.current = true;
        if (voiceRef.current) {
          console.log(`TTS voice selected: ${voiceRef.current.name} (${voiceRef.current.lang})`);
        }
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    // Chrome keepalive — prevents speech from freezing after ~15s
    keepAliveRef.current = setInterval(() => {
      if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }, 5000);

    return () => {
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
    };
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const speakNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      setIsSpeaking(false);
      activeRef.current = null;
      clearWatchdog();
      return;
    }

    const chunk = queueRef.current.shift()!;
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    if (voiceRef.current) {
      utterance.voice = voiceRef.current;
    }

    utterance.onend = () => {
      clearWatchdog();
      speakNext();
    };

    utterance.onerror = (e) => {
      if (e.error === "canceled" || e.error === "interrupted") return;
      clearWatchdog();
      speakNext();
    };

    activeRef.current = utterance;

    // Watchdog: if Chrome's onend doesn't fire, force advance
    const estimatedMs = (chunk.length / CHARS_PER_SECOND) * 1000 + WATCHDOG_MARGIN_MS;
    clearWatchdog();
    watchdogRef.current = setTimeout(() => {
      window.speechSynthesis?.cancel();
      speakNext();
    }, estimatedMs);

    window.speechSynthesis.speak(utterance);
  }, [clearWatchdog]);

  const speak = useCallback((text: string) => {
    if (!text.trim()) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    clearWatchdog();
    queueRef.current = [];

    // Split into chunks and queue
    queueRef.current = splitIntoChunks(text);
    setIsSpeaking(true);
    speakNext();
  }, [speakNext, clearWatchdog]);

  const cancel = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    queueRef.current = [];
    activeRef.current = null;
    clearWatchdog();
    setIsSpeaking(false);
  }, [clearWatchdog]);

  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  return { speak, cancel, isSpeaking, isSupported };
}
