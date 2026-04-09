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

const HEALTH_CHECK_MS = 1500;
const MAX_DEAD_MS = 3000;
const MAX_RESTART_FAILURES = 4;

/** Enable debug: type window.__STT_DEBUG = true in console */
const sttLog = (...args: any[]) => {
  if (typeof window !== "undefined" && (window as any).__STT_DEBUG) {
    console.log("[STT]", ...args);
  }
};

/**
 * Chrome Web Speech API STT hook.
 *
 * Key design: ONLY trust isFinal results from Chrome. Never force-save interim
 * text into the final transcript — this causes duplication because Chrome
 * replays/revises interim text constantly and eventually promotes it to final.
 *
 * The ONLY time we save interim is on explicit stop() — when the user clicks
 * "Stop Speaking" and we need to capture whatever was in the buffer.
 */
export function useSpeechRecognition(language: string = "en"): SpeechRecognitionHook {
  const langTag = LANG_MAP[language] || "en-US";
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [lastFinalAt, setLastFinalAt] = useState(0);

  const recognitionRef = useRef<any>(null);
  const isActiveRef = useRef(false);
  const isRunningRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastResultAtRef = useRef(0);
  const restartCountRef = useRef(0);
  const restartFailCountRef = useRef(0);

  /** Single source of truth — ONLY written by isFinal results and stop() */
  const finalRef = useRef("");
  /** Current interim text — temporary, may change or vanish */
  const interimRef = useRef("");
  /** Instance ID to reject stale events */
  const instanceIdRef = useRef(0);

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // ── Create recognition instance ────────────────────────────────────────
  const createRecognition = useCallback((myInstanceId: number) => {
    if (!isSupported) return null;

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = langTag;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      if (!isActiveRef.current) return;
      if (myInstanceId !== instanceIdRef.current) return;

      lastResultAtRef.current = Date.now();
      restartCountRef.current = 0;
      restartFailCountRef.current = 0;

      let newFinal = "";
      let newInterim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          newFinal += text;
        } else {
          newInterim += text;
        }
      }

      // Update interim ref
      interimRef.current = newInterim;

      if (newFinal) {
        sttLog("✅ FINAL:", JSON.stringify(newFinal));
        finalRef.current = finalRef.current + newFinal + " ";
        setTranscript(finalRef.current.trim());
        setLastFinalAt(Date.now());
      }

      setInterimTranscript(newInterim);
    };

    recognition.onerror = (event: any) => {
      sttLog("❌ ERROR:", event.error);
      if (event.error === "not-allowed") {
        isActiveRef.current = false;
        isRunningRef.current = false;
        setIsListening(false);
      }
      // no-speech, aborted — non-fatal, onend handles restart
    };

    recognition.onstart = () => {
      isRunningRef.current = true;
      lastResultAtRef.current = Date.now();
      sttLog("🟢 STARTED");
    };

    recognition.onend = () => {
      isRunningRef.current = false;
      sttLog("🔴 ENDED | interim:", JSON.stringify(interimRef.current.trim()));

      if (isActiveRef.current && myInstanceId === instanceIdRef.current) {
        // DO NOT save interim here — Chrome will re-deliver it as final after restart.
        // Only clear the display.
        interimRef.current = "";
        setInterimTranscript("");

        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

        const backoff = restartCountRef.current === 0 ? 0 : Math.min(300, 80 * restartCountRef.current);
        restartCountRef.current++;

        const doRestart = () => {
          if (!isActiveRef.current || !recognitionRef.current || isRunningRef.current) return;
          if (myInstanceId !== instanceIdRef.current) return;

          try {
            recognitionRef.current.start();
            setIsListening(true);
            restartCountRef.current = 0;
          } catch {
            restartFailCountRef.current++;
            if (restartFailCountRef.current >= MAX_RESTART_FAILURES) {
              sttLog("🔄 Recreating instance");
              instanceIdRef.current++;
              const newId = instanceIdRef.current;
              try { recognitionRef.current.abort(); } catch {}
              const fresh = createRecognition(newId);
              if (fresh) {
                recognitionRef.current = fresh;
                restartCountRef.current = 0;
                restartFailCountRef.current = 0;
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

        if (backoff === 0) {
          requestAnimationFrame(doRestart);
        } else {
          restartTimerRef.current = setTimeout(doRestart, backoff);
        }
      } else {
        setIsListening(false);
        setInterimTranscript("");
      }
    };

    return recognition;
  }, [isSupported, langTag]);

  // ── Initialize ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupported) return;
    instanceIdRef.current++;
    const id = instanceIdRef.current;
    const recognition = createRecognition(id);
    if (!recognition) return;
    recognitionRef.current = recognition;

    return () => {
      isActiveRef.current = false;
      isRunningRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (healthCheckRef.current) clearInterval(healthCheckRef.current);
      try { recognition.abort(); } catch {}
    };
  }, [isSupported, createRecognition]);

  // ── Health check: detect silently killed recognition ───────────────────
  useEffect(() => {
    if (healthCheckRef.current) {
      clearInterval(healthCheckRef.current);
      healthCheckRef.current = null;
    }
    if (!isListening || !isActiveRef.current) return;

    healthCheckRef.current = setInterval(() => {
      if (!isActiveRef.current || !recognitionRef.current) return;

      const dead = Date.now() - lastResultAtRef.current;
      if (dead > MAX_DEAD_MS) {
        sttLog("💀 Dead for", dead, "ms — restarting");
        isRunningRef.current = false;
        try { recognitionRef.current.abort(); } catch {}
        // onend handler will restart
      }
    }, HEALTH_CHECK_MS);

    return () => {
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
        healthCheckRef.current = null;
      }
    };
  }, [isListening]);

  // ── Public API ─────────────────────────────────────────────────────────

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

    isActiveRef.current = true;
    restartCountRef.current = 0;
    restartFailCountRef.current = 0;
    lastResultAtRef.current = Date.now();
    interimRef.current = "";
    finalRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);

    try {
      recognitionRef.current.start();
      isRunningRef.current = true;
      setIsListening(true);
    } catch {}
  }, []);

  const getSnapshot = useCallback((): string => {
    const final = finalRef.current.trim();
    const pending = interimRef.current.trim();
    return pending ? (final + " " + pending).trim() : final;
  }, []);

  const stop = useCallback((): string => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    isActiveRef.current = false;

    // ONLY save interim on explicit stop — this is the one case where
    // Chrome won't get a chance to finalize the pending text
    const pending = interimRef.current.trim();
    if (pending.length > 2) {
      sttLog("💾 Saving interim on stop:", JSON.stringify(pending));
      finalRef.current = finalRef.current + pending + " ";
    }

    const completeText = finalRef.current.trim();

    setTranscript(completeText);
    setInterimTranscript("");
    setLastFinalAt(0);
    interimRef.current = "";

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }
    isRunningRef.current = false;
    setIsListening(false);

    return completeText;
  }, []);

  const reset = useCallback(() => {
    finalRef.current = "";
    interimRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);
  }, []);

  return { transcript, interimTranscript, isListening, isSupported, lastFinalAt, start, stop, reset, getSnapshot };
}
