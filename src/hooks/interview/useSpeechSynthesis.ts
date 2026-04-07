"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechSynthesisHook {
  speak: (text: string) => void;
  cancel: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
}

const CHARS_PER_SECOND = 14; // conservative estimate for TTS at rate 0.95
const WATCHDOG_MARGIN_MS = 4000;

/**
 * Split text into sentence-boundary chunks ≤ 200 chars.
 * Chrome silently truncates long utterances and has a known bug where
 * speechSynthesis stops working after ~15 min. Chunking prevents both.
 */
function splitIntoChunks(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
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
  return chunks.length ? chunks : [text];
}

/** Language code → TTS voice language prefix */
const TTS_LANG_MAP: Record<string, string> = {
  en: "en",
  hi: "hi",
  ar: "ar",
  hinglish: "hi", // Hinglish uses Hindi voice
};

export function useSpeechSynthesis(language: string = "en"): SpeechSynthesisHook {
  const ttsLang = TTS_LANG_MAP[language] || "en";
  const [isSpeaking, setIsSpeaking] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<string[]>([]);
  const speakingRef = useRef(false); // internal flag, separate from React state

  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // ── Load preferred voice ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupported) return;
    const loadVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      // Prefer Google/Natural voices for the selected language
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith(ttsLang) &&
          (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Samantha"))
      );
      voiceRef.current = preferred || voices.find((v) => v.lang.startsWith(ttsLang)) || null;
    };
    loadVoice();
    window.speechSynthesis.onvoiceschanged = loadVoice;
  }, [isSupported, ttsLang]);

  // ── Chrome keepalive: resume if paused every 5 s (prevents 15-min freeze) ──
  useEffect(() => {
    if (!isSupported) return;
    const id = setInterval(() => {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [isSupported]);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  // ── Speak one chunk, then recurse through the queue ───────────────────────
  const speakChunk = useCallback(
    (chunk: string) => {
      if (!isSupported || !speakingRef.current) return;

      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      if (voiceRef.current) utterance.voice = voiceRef.current;

      utterance.onend = () => {
        clearWatchdog();
        if (!speakingRef.current) {
          setIsSpeaking(false);
          return;
        }
        const next = queueRef.current.shift();
        if (next) {
          speakChunk(next);
        } else {
          speakingRef.current = false;
          setIsSpeaking(false);
        }
      };

      utterance.onerror = (e) => {
        clearWatchdog();
        // 'interrupted' means cancel() was called — not a real error
        if (e.error === "interrupted" || e.error === "canceled") {
          speakingRef.current = false;
          setIsSpeaking(false);
          return;
        }
        console.warn("[TTS] utterance error:", e.error);
        // Try next chunk anyway
        const next = queueRef.current.shift();
        if (next && speakingRef.current) {
          speakChunk(next);
        } else {
          speakingRef.current = false;
          setIsSpeaking(false);
        }
      };

      window.speechSynthesis.speak(utterance);

      // Watchdog per chunk — if onend never fires (Chrome bug), force advance
      const estimatedMs = (chunk.length / CHARS_PER_SECOND) * 1000 + WATCHDOG_MARGIN_MS;
      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        if (!speakingRef.current) return;
        console.warn("[TTS Watchdog] Chunk timed out, advancing queue");
        window.speechSynthesis.cancel();
        const next = queueRef.current.shift();
        if (next) {
          speakChunk(next);
        } else {
          speakingRef.current = false;
          setIsSpeaking(false);
        }
      }, estimatedMs);
    },
    [isSupported, clearWatchdog]
  );

  // ── Public: speak full text ───────────────────────────────────────────────
  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !text.trim()) return;

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      clearWatchdog();
      queueRef.current = [];
      speakingRef.current = false;

      const chunks = splitIntoChunks(text);
      if (!chunks.length) return;

      speakingRef.current = true;
      setIsSpeaking(true);

      // Load first chunk immediately, rest into queue
      const [first, ...rest] = chunks;
      queueRef.current = rest;
      speakChunk(first);
    },
    [isSupported, clearWatchdog, speakChunk]
  );

  // ── Public: cancel all speech ─────────────────────────────────────────────
  const cancel = useCallback(() => {
    if (!isSupported) return;
    clearWatchdog();
    speakingRef.current = false;
    queueRef.current = [];
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
