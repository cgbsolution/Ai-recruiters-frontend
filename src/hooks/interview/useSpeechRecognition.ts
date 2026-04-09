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

/** Language code → Web Speech API lang tag */
const LANG_MAP: Record<string, string> = {
  en: "en-US",
  hi: "hi-IN",
  ar: "ar-SA",
  hinglish: "hi-IN",
};

/**
 * Chrome Web Speech API has these known word-eating bugs:
 * 1. Kills recognition after ~60s silence or ~5min total → onend fires, gap before restart
 * 2. Interim results vanish without becoming final when recognition restarts
 * 3. resultIndex sometimes resets after restart, causing missed results
 * 4. Late final results arrive AFTER onend, getting discarded
 *
 * This hook addresses ALL of these with:
 * - Dual-instance overlap: new instance starts BEFORE old one fully stops
 * - Aggressive interim preservation: any interim text >2 chars is saved on restart
 * - Late result acceptance: results accepted for 500ms after onend
 * - Periodic interim snapshot: captures interim every 500ms as safety net
 * - No-gap restart: uses requestAnimationFrame for zero-delay restart
 */

const HEALTH_CHECK_MS = 1200;
const MAX_DEAD_MS = 2500;
const MAX_RESTART_FAILURES = 4;
const LATE_RESULT_WINDOW_MS = 500;
const MIN_INTERIM_SAVE_LENGTH = 2;

/** Enable debug logging — type window.__STT_DEBUG = true in browser console */
const sttLog = (...args: any[]) => {
  if (typeof window !== "undefined" && (window as any).__STT_DEBUG) {
    console.log("[STT]", ...args);
  }
};

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

  /** Single source of truth for all confirmed text */
  const finalRef = useRef("");
  /** Latest unconfirmed text — saved aggressively on any restart/kill */
  const interimRef = useRef("");
  /** Timestamp when onend fired — used to accept late results */
  const endedAtRef = useRef(0);
  /** Snapshot timer for periodic interim backup */
  const interimBackupRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Last backed-up interim — prevents duplicate saves */
  const lastBackedUpInterimRef = useRef("");
  /** Instance ID — prevents stale instances from writing to refs */
  const instanceIdRef = useRef(0);

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // ── Helper: save interim to final ──────────────────────────────────────
  const saveInterimToFinal = useCallback(() => {
    const interim = interimRef.current.trim();
    if (interim.length >= MIN_INTERIM_SAVE_LENGTH) {
      // Deduplicate: check if the final text already ends with this interim
      const currentFinal = finalRef.current.trim();
      if (!currentFinal.endsWith(interim)) {
        finalRef.current = currentFinal + " " + interim + " ";
        setTranscript(finalRef.current.trim());
        setLastFinalAt(Date.now());
      }
      interimRef.current = "";
      lastBackedUpInterimRef.current = "";
      setInterimTranscript("");
    }
  }, []);

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
      const isLateResult = endedAtRef.current > 0 && (Date.now() - endedAtRef.current) < LATE_RESULT_WINDOW_MS;
      if (!isActiveRef.current && !isLateResult) {
        sttLog("⛔ REJECTED result (not active, not late)", { isActive: isActiveRef.current, isLate: isLateResult });
        return;
      }
      if (myInstanceId !== instanceIdRef.current) {
        sttLog("⛔ REJECTED result (stale instance)", { my: myInstanceId, current: instanceIdRef.current });
        return;
      }

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

      if (newFinal) {
        sttLog("✅ FINAL:", JSON.stringify(newFinal), "| total:", JSON.stringify((finalRef.current + newFinal).trim().slice(-80)));
      }
      if (newInterim) {
        sttLog("📝 INTERIM:", JSON.stringify(newInterim.slice(-60)));
      }
      if (isLateResult) {
        sttLog("⏰ LATE RESULT accepted:", JSON.stringify(newFinal || newInterim));
      }

      interimRef.current = newInterim;

      if (newFinal) {
        lastBackedUpInterimRef.current = "";
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
        return;
      }
      // no-speech and aborted are non-fatal — onend handles restart
    };

    recognition.onstart = () => {
      isRunningRef.current = true;
      endedAtRef.current = 0;
      lastResultAtRef.current = Date.now();
      sttLog("🟢 STARTED (instance", myInstanceId, ")");
    };

    recognition.onend = () => {
      isRunningRef.current = false;
      endedAtRef.current = Date.now();

      const savedInterim = interimRef.current.trim();
      sttLog("🔴 ENDED (instance", myInstanceId, ") | pending interim:", JSON.stringify(savedInterim), "| final so far:", finalRef.current.trim().length, "chars");

      if (isActiveRef.current && myInstanceId === instanceIdRef.current) {
        saveInterimToFinal();
        if (savedInterim.length >= MIN_INTERIM_SAVE_LENGTH) {
          sttLog("💾 SAVED interim on restart:", JSON.stringify(savedInterim));
        }

        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

        // Zero-delay restart on first attempt, tiny backoff on retries
        const backoff = restartCountRef.current === 0 ? 0 : Math.min(300, 80 * restartCountRef.current);
        restartCountRef.current++;

        const doRestart = () => {
          if (!isActiveRef.current || !recognitionRef.current || isRunningRef.current) return;
          if (myInstanceId !== instanceIdRef.current) return; // Stale instance

          try {
            recognitionRef.current.start();
            setIsListening(true);
            restartCountRef.current = 0;
          } catch {
            restartFailCountRef.current++;
            if (restartFailCountRef.current >= MAX_RESTART_FAILURES) {
              // Recreate entire instance
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
          // Use rAF for truly zero-delay restart — executes before next paint
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
  }, [isSupported, langTag, saveInterimToFinal]);

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
      if (interimBackupRef.current) clearInterval(interimBackupRef.current);
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
        // Save interim before force-restart
        saveInterimToFinal();

        isRunningRef.current = false;
        try { recognitionRef.current.abort(); } catch {}

        restartFailCountRef.current++;
        if (restartFailCountRef.current >= MAX_RESTART_FAILURES) {
          // Full recreation
          instanceIdRef.current++;
          const newId = instanceIdRef.current;
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
          return;
        }

        // Quick restart
        if (!isRunningRef.current) {
          try {
            recognitionRef.current.start();
            isRunningRef.current = true;
            setIsListening(true);
            lastResultAtRef.current = Date.now();
          } catch {}
        }
      }
    }, HEALTH_CHECK_MS);

    return () => {
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
        healthCheckRef.current = null;
      }
    };
  }, [isListening, createRecognition, saveInterimToFinal]);

  // ── Periodic interim backup: every 500ms, snapshot interim as safety net ─
  useEffect(() => {
    if (interimBackupRef.current) {
      clearInterval(interimBackupRef.current);
      interimBackupRef.current = null;
    }
    if (!isListening || !isActiveRef.current) return;

    interimBackupRef.current = setInterval(() => {
      if (!isActiveRef.current) return;
      const current = interimRef.current.trim();
      // If we have substantial interim text that hasn't changed in 500ms,
      // it might be stuck (Chrome sometimes never promotes to final)
      if (current.length > 10 && current === lastBackedUpInterimRef.current) {
        sttLog("🔒 STUCK interim detected (1s unchanged), force-saving:", JSON.stringify(current.slice(-60)));
        saveInterimToFinal();
      }
      lastBackedUpInterimRef.current = current;
    }, 500);

    return () => {
      if (interimBackupRef.current) {
        clearInterval(interimBackupRef.current);
        interimBackupRef.current = null;
      }
    };
  }, [isListening, saveInterimToFinal]);

  // ── Public API ─────────────────────────────────────────────────────────

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

    isActiveRef.current = true;
    restartCountRef.current = 0;
    restartFailCountRef.current = 0;
    lastResultAtRef.current = Date.now();
    endedAtRef.current = 0;
    interimRef.current = "";
    lastBackedUpInterimRef.current = "";
    finalRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);

    try {
      recognitionRef.current.start();
      isRunningRef.current = true;
      setIsListening(true);
    } catch {
      // Already started
    }
  }, []);

  const getSnapshot = useCallback((): string => {
    const final = finalRef.current.trim();
    const pending = interimRef.current.trim();
    return pending ? (final + " " + pending).trim() : final;
  }, []);

  const stop = useCallback((): string => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    isActiveRef.current = false;

    // Save any pending interim BEFORE stopping
    if (interimRef.current.trim().length >= MIN_INTERIM_SAVE_LENGTH) {
      const saved = interimRef.current.trim();
      const currentFinal = finalRef.current.trim();
      if (!currentFinal.endsWith(saved)) {
        finalRef.current = currentFinal + " " + saved + " ";
      }
    }

    const completeText = finalRef.current.trim();

    setTranscript(completeText);
    setInterimTranscript("");
    setLastFinalAt(0);
    interimRef.current = "";
    lastBackedUpInterimRef.current = "";

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
    lastBackedUpInterimRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);
  }, []);

  return { transcript, interimTranscript, isListening, isSupported, lastFinalAt, start, stop, reset, getSnapshot };
}
