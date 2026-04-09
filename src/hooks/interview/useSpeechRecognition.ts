"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionHook {
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
  isSupported: boolean;
  lastFinalAt: number;
  start: () => void;
  stop: () => string;
  reset: () => void;
  getSnapshot: () => string;
}

const LANG_MAP: Record<string, string> = {
  en: "en-US",
  hi: "hi-IN",
  ar: "ar-SA",
  hinglish: "hi-IN",
};

const HEALTH_CHECK_MS = 2000;
const MAX_DEAD_MS = 4000;

const sttLog = (...args: any[]) => {
  if (typeof window !== "undefined" && (window as any).__STT_DEBUG) {
    console.log("[STT]", new Date().toISOString().slice(11, 23), ...args);
  }
};

/**
 * Chrome Web Speech STT — bulletproof version.
 *
 * All state is stored in refs (not React state) to prevent re-render cascades
 * from killing the recognition instance. React state is only used for display.
 */
export function useSpeechRecognition(language: string = "en"): SpeechRecognitionHook {
  const langTag = LANG_MAP[language] || "en-US";

  // ── React state (for display only) ──
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [lastFinalAt, setLastFinalAt] = useState(0);

  // ── Refs (the real state — survives re-renders) ──
  const recognitionRef = useRef<any>(null);
  const isActiveRef = useRef(false);
  const isRunningRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastResultAtRef = useRef(0);
  const restartFailsRef = useRef(0);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const processedIndicesRef = useRef<Set<number>>(new Set());
  const langRef = useRef(langTag);
  langRef.current = langTag; // Always current, no re-render

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // ── Build a recognition instance (pure function, no hooks) ──
  const buildRecognition = useCallback(() => {
    if (!isSupported) return null;

    const API = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new API();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = langRef.current;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      if (!isActiveRef.current) {
        console.warn("[STT] ⛔ Result rejected — not active");
        return;
      }

      lastResultAtRef.current = Date.now();
      restartFailsRef.current = 0;

      let newFinal = "";
      let newInterim = "";

      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        const text = r[0].transcript;
        if (r.isFinal) {
          if (processedIndicesRef.current.has(i)) continue;
          processedIndicesRef.current.add(i);
          newFinal += text;
          sttLog("✅ FINAL[" + i + "]:", text.slice(0, 60));
        } else {
          newInterim += text;
        }
      }

      if (newFinal) {
        finalRef.current += newFinal + " ";
        interimRef.current = newInterim;
        setLastFinalAt(Date.now());
      } else {
        // Anti-flicker: only update interim if longer or different
        const prev = interimRef.current;
        if (newInterim.length >= prev.length || !prev.startsWith(newInterim.slice(0, 8))) {
          interimRef.current = newInterim;
        }
      }

      // Update display
      const display = (finalRef.current + interimRef.current).trim();
      setTranscript(display);
      setInterimTranscript(interimRef.current);
    };

    rec.onerror = (event: any) => {
      sttLog("❌", event.error);
      if (event.error === "not-allowed") {
        isActiveRef.current = false;
        isRunningRef.current = false;
        setIsListening(false);
      }
    };

    rec.onstart = () => {
      isRunningRef.current = true;
      lastResultAtRef.current = Date.now();
      processedIndicesRef.current = new Set();
      console.warn("[STT] 🟢 STARTED | finalRef:", finalRef.current.length, "chars | sample:", JSON.stringify(finalRef.current.slice(-50)));
    };

    rec.onend = () => {
      isRunningRef.current = false;

      // ALWAYS log restart events — critical for diagnosing word loss
      console.warn("[STT] 🔴 ENDED | active:", isActiveRef.current,
        "| finalRef:", finalRef.current.length, "chars",
        "| interimRef:", interimRef.current.length, "chars",
        "| sample:", JSON.stringify(finalRef.current.slice(-50)));

      if (!isActiveRef.current) {
        setIsListening(false);
        setInterimTranscript("");
        return;
      }

      // Preserve display: set transcript to finals before clearing interim
      const preservedDisplay = finalRef.current.trim();
      if (preservedDisplay) {
        setTranscript(preservedDisplay);
      }
      interimRef.current = "";
      setInterimTranscript("");

      // Restart
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

      const doRestart = () => {
        if (!isActiveRef.current || isRunningRef.current) return;
        const r = recognitionRef.current;
        if (!r) return;

        // Verify finalRef is still intact before restart
        console.warn("[STT] 🔄 RESTARTING | finalRef:", finalRef.current.length, "chars");

        try {
          r.lang = langRef.current;
          r.start();
          setIsListening(true);
        } catch {
          restartFailsRef.current++;
          if (restartFailsRef.current >= 4) {
            console.warn("[STT] 🔧 Recreating instance | finalRef:", finalRef.current.length, "chars");
            try { r.abort(); } catch {}
            const fresh = buildRecognition();
            if (fresh) {
              recognitionRef.current = fresh;
              restartFailsRef.current = 0;
              try {
                fresh.start();
                isRunningRef.current = true;
                setIsListening(true);
                lastResultAtRef.current = Date.now();
              } catch {}
            }
          } else {
            restartTimerRef.current = setTimeout(doRestart, 200);
          }
        }
      };

      requestAnimationFrame(doRestart);
    };

    return rec;
  }, [isSupported]); // Only depends on isSupported — NEVER re-creates on re-render

  // ── Initialize once on mount ──
  useEffect(() => {
    if (!isSupported) return;
    const rec = buildRecognition();
    if (!rec) return;
    recognitionRef.current = rec;

    return () => {
      // Only clean up on unmount, not on re-render
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (healthCheckRef.current) clearInterval(healthCheckRef.current);
      isActiveRef.current = false;
      isRunningRef.current = false;
      try { rec.abort(); } catch {}
    };
  }, [isSupported, buildRecognition]);

  // ── Health check: detect silently killed recognition ──
  useEffect(() => {
    if (healthCheckRef.current) clearInterval(healthCheckRef.current);
    healthCheckRef.current = null;

    if (!isListening) return;

    healthCheckRef.current = setInterval(() => {
      if (!isActiveRef.current || !recognitionRef.current || !isRunningRef.current) return;
      const dead = Date.now() - lastResultAtRef.current;
      if (dead > MAX_DEAD_MS) {
        sttLog("💀 Dead for", dead, "ms — aborting to trigger restart");
        try { recognitionRef.current.abort(); } catch {}
        // onend will handle restart
      }
    }, HEALTH_CHECK_MS);

    return () => {
      if (healthCheckRef.current) clearInterval(healthCheckRef.current);
      healthCheckRef.current = null;
    };
  }, [isListening]);

  // ── Public API ──

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

    // Clear all accumulated text
    finalRef.current = "";
    interimRef.current = "";
    processedIndicesRef.current = new Set();
    restartFailsRef.current = 0;
    lastResultAtRef.current = Date.now();

    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);

    // Activate
    isActiveRef.current = true;
    rec.lang = langRef.current;

    try {
      rec.start();
      isRunningRef.current = true;
      setIsListening(true);
    } catch {
      // Already started — ignore
    }
  }, []);

  const getSnapshot = useCallback((): string => {
    return (finalRef.current + interimRef.current).trim();
  }, []);

  const stop = useCallback((): string => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    isActiveRef.current = false;

    // Capture pending interim before stopping
    const pending = interimRef.current.trim();
    if (pending.length > 2) {
      sttLog("💾 Saving interim on stop:", pending.slice(0, 60));
      finalRef.current += pending + " ";
    }

    const result = finalRef.current.trim();
    setTranscript(result);
    setInterimTranscript("");
    interimRef.current = "";

    try { recognitionRef.current?.abort(); } catch {}
    isRunningRef.current = false;
    setIsListening(false);

    return result;
  }, []);

  const reset = useCallback(() => {
    finalRef.current = "";
    interimRef.current = "";
    processedIndicesRef.current = new Set();
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);
  }, []);

  return { transcript, interimTranscript, isListening, isSupported, lastFinalAt, start, stop, reset, getSnapshot };
}
