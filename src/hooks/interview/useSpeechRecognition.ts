"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionHook {
  /** Accumulated final (confirmed) transcript text */
  transcript: string;
  /** Current interim (unconfirmed) text — may change or disappear */
  interimTranscript: string;
  /** Whether the recognizer is actively listening */
  isListening: boolean;
  /** Whether Web Speech API is available in this browser */
  isSupported: boolean;
  /** Timestamp (ms) of the most recent final transcript update */
  lastFinalAt: number;
  /** Start listening — clears previous transcript */
  start: () => void;
  /** Stop listening — discards buffered audio */
  stop: () => void;
  /** Clear transcript state without stopping */
  reset: () => void;
}

/**
 * Maximum time (ms) the recognizer can stay "dead" before we force a restart.
 * Chrome kills continuous recognition after ~60s of silence or ~5min total.
 * Reduced from 5000→3000 for faster detection of dead recognition.
 */
const HEALTH_CHECK_INTERVAL_MS = 2500;
const MAX_DEAD_TIME_MS = 5000;

/** After this many consecutive restart failures, recreate the instance */
const MAX_RESTART_FAILURES = 4;

export function useSpeechRecognition(): SpeechRecognitionHook {
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [lastFinalAt, setLastFinalAt] = useState(0);
  const recognitionRef = useRef<any>(null);
  const isActiveRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Track when we last received ANY result (final or interim) to detect dead recognition */
  const lastResultAtRef = useRef(0);
  /** Count consecutive restarts to apply exponential backoff */
  const restartCountRef = useRef(0);
  /** Track if recognition is currently running (not just "should be") */
  const isRunningRef = useRef(false);
  /** Count consecutive restart failures to trigger instance recreation */
  const restartFailCountRef = useRef(0);
  /** Ref to latest interim text — used to save pending text on restart */
  const pendingInterimRef = useRef("");

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  /** Create a fresh SpeechRecognition instance with all handlers */
  const createRecognition = useCallback(() => {
    if (!isSupported) return null;

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      // Guard: discard results when recognition is supposed to be stopped.
      if (!isActiveRef.current) return;

      // Track that we're receiving results (for health check)
      lastResultAtRef.current = Date.now();
      // Reset restart backoff on successful results
      restartCountRef.current = 0;
      restartFailCountRef.current = 0;

      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const t = result[0].transcript;
        if (result.isFinal) {
          // Accept all final results — the Web Speech API already filters
          // low-quality results internally. Previously a 0.4 threshold was
          // dropping legitimate speech, causing word loss.
          finalText += t;
        } else {
          interimText += t;
        }
      }
      // Keep track of latest interim for emergency save on restart
      pendingInterimRef.current = interimText;

      if (finalText) {
        setTranscript((prev) => (prev.trim() + " " + finalText.trim()).trim());
        setLastFinalAt(Date.now());
      }
      setInterimTranscript(interimText);
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed") {
        isActiveRef.current = false;
        isRunningRef.current = false;
        setIsListening(false);
        return;
      }
      // 'no-speech' and 'aborted' are non-fatal — onend will handle restart
      if (event.error !== "no-speech" && event.error !== "aborted") {
        console.error("[SpeechRecognition] error:", event.error);
      }
    };

    recognition.onstart = () => {
      isRunningRef.current = true;
      lastResultAtRef.current = Date.now();
    };

    recognition.onend = () => {
      isRunningRef.current = false;
      setIsListening(false);

      // Auto-restart if we're supposed to be listening
      if (isActiveRef.current) {
        // CRITICAL: Save any pending interim text as final BEFORE restarting.
        // Chrome kills recognition mid-sentence, losing the interim buffer.
        // Promoting it to final text prevents word loss during restarts.
        if (pendingInterimRef.current.trim()) {
          const saved = pendingInterimRef.current.trim();
          setTranscript((prev) => (prev.trim() + " " + saved).trim());
          setLastFinalAt(Date.now());
          pendingInterimRef.current = "";
          setInterimTranscript("");
        }

        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

        // Restart strategy: IMMEDIATE on first attempt (0ms gap = no lost words),
        // then minimal backoff on consecutive failures: 100ms, 200ms, max 400ms.
        // Keeping backoff low to minimize gaps where speech is not captured.
        const isFirstAttempt = restartCountRef.current === 0;
        const backoff = isFirstAttempt ? 0 : Math.min(400, 100 * restartCountRef.current);
        restartCountRef.current++;

        const doRestart = () => {
          if (!isActiveRef.current || !recognitionRef.current || isRunningRef.current) return;
          try {
            recognitionRef.current.start();
            setIsListening(true);
            restartCountRef.current = 0; // reset on success
          } catch {
            restartFailCountRef.current++;
            if (restartFailCountRef.current >= MAX_RESTART_FAILURES) {
              console.warn("[SpeechRecognition] Too many restart failures — recreating instance");
              recreateInstance();
            } else {
              // Retry after a short delay
              restartTimerRef.current = setTimeout(doRestart, 300);
            }
          }
        };

        if (backoff === 0) {
          doRestart(); // immediate restart — zero gap
        } else {
          restartTimerRef.current = setTimeout(doRestart, backoff);
        }
      } else {
        // Only clear interim when we're intentionally stopped
        setInterimTranscript("");
      }
    };

    return recognition;
  }, [isSupported]);

  /** Recreate the SpeechRecognition instance — used when Chrome completely kills it */
  const recreateInstance = useCallback(() => {
    if (!isActiveRef.current) return;

    // Save any pending interim text as final before recreating
    if (pendingInterimRef.current.trim()) {
      const saved = pendingInterimRef.current.trim();
      setTranscript((prev) => (prev.trim() + " " + saved).trim());
      setLastFinalAt(Date.now());
      pendingInterimRef.current = "";
      setInterimTranscript("");
    }

    // Dispose old instance
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }
    isRunningRef.current = false;

    // Create fresh instance
    const newRecognition = createRecognition();
    if (!newRecognition) return;
    recognitionRef.current = newRecognition;
    restartCountRef.current = 0;
    restartFailCountRef.current = 0;

    // Start immediately — no delay
    if (isActiveRef.current && recognitionRef.current && !isRunningRef.current) {
      try {
        recognitionRef.current.start();
        isRunningRef.current = true;
        setIsListening(true);
        lastResultAtRef.current = Date.now();
      } catch {
        console.error("[SpeechRecognition] Failed to start recreated instance");
      }
    }
  }, [createRecognition]);

  // Initialize recognition on mount
  useEffect(() => {
    if (!isSupported) return;
    const recognition = createRecognition();
    if (!recognition) return;
    recognitionRef.current = recognition;

    return () => {
      isActiveRef.current = false;
      isRunningRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (healthCheckRef.current) clearInterval(healthCheckRef.current);
      recognition.abort();
    };
  }, [isSupported, createRecognition]);

  /**
   * Health check: detect when Chrome silently kills recognition without
   * firing onend (happens after long sessions). Force-restart if needed.
   * Now directly restarts instead of only relying on the onend chain.
   */
  useEffect(() => {
    if (healthCheckRef.current) {
      clearInterval(healthCheckRef.current);
      healthCheckRef.current = null;
    }

    if (!isListening || !isActiveRef.current) return;

    healthCheckRef.current = setInterval(() => {
      if (!isActiveRef.current || !recognitionRef.current) return;

      const timeSinceResult = Date.now() - lastResultAtRef.current;

      if (timeSinceResult > MAX_DEAD_TIME_MS) {
        console.warn(
          `[SpeechRecognition] No results for ${timeSinceResult}ms — force-restarting`
        );

        // Save any pending interim text before restart
        if (pendingInterimRef.current.trim()) {
          const saved = pendingInterimRef.current.trim();
          setTranscript((prev) => (prev.trim() + " " + saved).trim());
          setLastFinalAt(Date.now());
          pendingInterimRef.current = "";
          setInterimTranscript("");
        }

        isRunningRef.current = false;
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }

        // Directly attempt restart instead of waiting for onend chain
        restartFailCountRef.current++;
        if (restartFailCountRef.current >= MAX_RESTART_FAILURES) {
          console.warn("[SpeechRecognition] Multiple dead periods — recreating instance");
          recreateInstance();
          return;
        }

        // Restart immediately — minimize the gap where no recognition is running
        if (isActiveRef.current && recognitionRef.current && !isRunningRef.current) {
          try {
            recognitionRef.current.start();
            isRunningRef.current = true;
            setIsListening(true);
            lastResultAtRef.current = Date.now();
          } catch {
            // onend handler will try again
          }
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    return () => {
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
        healthCheckRef.current = null;
      }
    };
  }, [isListening, recreateInstance]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    isActiveRef.current = true;
    restartCountRef.current = 0;
    restartFailCountRef.current = 0;
    lastResultAtRef.current = Date.now();
    pendingInterimRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);
    try {
      recognitionRef.current.start();
      isRunningRef.current = true;
      setIsListening(true);
    } catch {
      // Already started — ignore
    }
  }, []);

  const stop = useCallback(() => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    isActiveRef.current = false;

    // CRITICAL: Save any pending interim text as final BEFORE stopping.
    // Without this, the last few words the user spoke are lost if Chrome
    // hadn't finalized them yet.
    if (pendingInterimRef.current.trim()) {
      const saved = pendingInterimRef.current.trim();
      setTranscript((prev) => (prev.trim() + " " + saved).trim());
    }

    setInterimTranscript("");
    setLastFinalAt(0);
    pendingInterimRef.current = "";
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Already stopped — ignore
      }
    }
    isRunningRef.current = false;
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);
    pendingInterimRef.current = "";
  }, []);

  return { transcript, interimTranscript, isListening, isSupported, lastFinalAt, start, stop, reset };
}
