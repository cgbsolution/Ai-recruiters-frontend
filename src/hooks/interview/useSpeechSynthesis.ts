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
};

// Male voice names to ALWAYS reject — covers Chrome, Edge, Safari
const MALE_VOICES = new Set([
  "male", "david", "daniel", "james", "rishi", "fred", "alex", "tom", "jorge",
  "mark", "george", "richard", "microsoft david", "microsoft mark", "microsoft george",
  "google us english", // Often male on Chrome
]);

/** Check if a voice name is male */
function isLikelyMale(name: string): boolean {
  const lower = name.toLowerCase();
  return Array.from(MALE_VOICES).some((m) => lower.includes(m));
}

/**
 * Best female voices ranked by quality (highest first).
 * LOCAL/offline voices preferred over Online Natural voices because:
 * - Edge's Online voices sometimes fail silently and fall back to male default
 * - Local voices are instant, no network dependency
 */
const FEMALE_PRIORITY = [
  // Best: Google voices (Chrome only, always local)
  "google uk english female",
  // Good: Microsoft LOCAL desktop voices (reliable, no network)
  "microsoft zira desktop", "microsoft zira",
  "zira",
  // Good: macOS local voices
  "samantha", "karen", "moira", "fiona", "victoria", "tessa",
  // Acceptable: Local female voices
  "neerja", "lekha", "veena", "isha", "damayanti", "sonia", "susan", "hazel",
  "heera",
  // Online Natural voices LAST — they're higher quality but unreliable on Edge
  // Edge sometimes ignores voice assignment and uses male default
  "microsoft jenny online", "microsoft aria online", "microsoft sara online",
  "jenny", "aria", "sara",
];

/** Find the best female voice from a list */
function pickFemaleVoice(voices: SpeechSynthesisVoice[], langPrefix: string): SpeechSynthesisVoice | null {
  const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  if (langVoices.length === 0) return null;

  // Separate local vs online voices — prefer local (more reliable)
  const localVoices = langVoices.filter((v) => v.localService || !v.name.includes("Online"));
  const onlineVoices = langVoices.filter((v) => !v.localService && v.name.includes("Online"));

  // Search local voices first, then online
  const searchOrder = [...localVoices, ...onlineVoices];

  // Try each preferred female voice in priority order
  for (const preferred of FEMALE_PRIORITY) {
    const match = searchOrder.find((v) =>
      v.name.toLowerCase().includes(preferred) && !isLikelyMale(v.name)
    );
    if (match) return match;
  }

  // Fallback: any LOCAL voice with "female" in name
  const localFemale = localVoices.find((v) =>
    v.name.toLowerCase().includes("female") && !isLikelyMale(v.name)
  );
  if (localFemale) return localFemale;

  // Fallback: any LOCAL voice NOT male
  const localNonMale = localVoices.find((v) => !isLikelyMale(v.name));
  if (localNonMale) return localNonMale;

  // Fallback: any voice NOT male (including online)
  const nonMale = langVoices.find((v) => !isLikelyMale(v.name));
  if (nonMale) return nonMale;

  return null;
}

export function useSpeechSynthesis(language: string = "en"): SpeechSynthesisHook {
  const ttsLang = TTS_LANG_MAP[language] || "en";
  const [isSpeaking, setIsSpeaking] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const voiceLoadedRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<string[]>([]);
  const speakingRef = useRef(false);

  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // ── Load preferred voice — retries until found ──────────────────────────
  useEffect(() => {
    if (!isSupported) return;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const loadVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0 && retryCount < 10) {
        // Voices not loaded yet — retry
        retryCount++;
        retryTimer = setTimeout(loadVoice, 300);
        return;
      }

      console.log("[TTS] All voices:", voices.map(v => `${v.name} (${v.lang})`).join(", "));

      const picked = pickFemaleVoice(voices, ttsLang);
      if (picked) {
        voiceRef.current = picked;
        voiceLoadedRef.current = true;
        console.log("[TTS] Selected:", picked.name, picked.lang);
      } else {
        voiceRef.current = null;
        voiceLoadedRef.current = true;
        console.warn("[TTS] No female voice for", ttsLang, "— will use pitch=1.3");
      }
    };

    loadVoice();
    window.speechSynthesis.onvoiceschanged = loadVoice;

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
    };
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

      // Last-second voice check — in case voices loaded late
      if (!voiceRef.current && voiceLoadedRef.current) {
        const fallback = pickFemaleVoice(window.speechSynthesis.getVoices(), ttsLang);
        if (fallback) voiceRef.current = fallback;
      }

      // Always re-pick voice right before speaking — browsers can change available voices
      if (!voiceRef.current || isLikelyMale(voiceRef.current.name)) {
        const fresh = pickFemaleVoice(window.speechSynthesis.getVoices(), ttsLang);
        if (fresh) voiceRef.current = fresh;
      }

      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.rate = 0.95;
      utterance.volume = 1.0;

      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
        utterance.lang = voiceRef.current.lang;
        // Slightly higher pitch to guarantee feminine sound even if browser
        // sometimes ignores voice assignment and uses system default
        utterance.pitch = 1.1;
      } else {
        // No female voice at all — pitch shift to force feminine sound
        utterance.pitch = 1.4;
      }
      console.log("[TTS] Speaking:", voiceRef.current?.name || "NO VOICE (pitch=1.4)", "| pitch:", utterance.pitch);

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
        if (e.error === "interrupted" || e.error === "canceled") {
          speakingRef.current = false;
          setIsSpeaking(false);
          return;
        }

        // Autoplay blocked — retry on first user click
        if (e.error === "not-allowed") {
          speakingRef.current = false;
          setIsSpeaking(false);
          console.log("[TTS] Blocked by autoplay — will retry on click");
          const retry = () => {
            if (pendingSpeakRef.current) {
              const saved = pendingSpeakRef.current;
              pendingSpeakRef.current = null;
              setTimeout(() => {
                speakingRef.current = true;
                setIsSpeaking(true);
                speakChunk(saved);
              }, 50);
            }
          };
          window.addEventListener("click", retry, { once: true });
          window.addEventListener("keydown", retry, { once: true });
          return;
        }

        console.warn("[TTS] utterance error:", e.error);
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

  // Track pending text that failed due to autoplay policy
  const pendingSpeakRef = useRef<string | null>(null);

  // ── Public: speak full text ───────────────────────────────────────────────
  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !text.trim()) return;

      // Always save as pending — in case this attempt fails
      pendingSpeakRef.current = text.trim();

      window.speechSynthesis.cancel();
      clearWatchdog();
      queueRef.current = [];
      speakingRef.current = true;
      setIsSpeaking(true);

      // Wait for voice to be loaded if not yet
      if (!voiceRef.current) {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          const picked = pickFemaleVoice(voices, ttsLang);
          if (picked) voiceRef.current = picked;
        }
      }

      speakChunk(text.trim());
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
