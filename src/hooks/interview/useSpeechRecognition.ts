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
  /** Stop listening — returns the complete captured text synchronously from the ref (not React state) */
  stop: () => string;
  /** Clear transcript state without stopping */
  reset: () => void;
  /** Read the current complete text synchronously — final + pending interim, straight from refs */
  getSnapshot: () => string;
}

/**
 * Maximum time (ms) the recognizer can stay "dead" before we force a restart.
 * Chrome kills continuous recognition after ~60s of silence or ~5min total.
 */
const HEALTH_CHECK_INTERVAL_MS = 1500;
const MAX_DEAD_TIME_MS = 3000;

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
  /** Persistent ref that accumulates ALL confirmed words — never cleared except by reset/start */
  const finalTranscriptRef = useRef(""); // FIX: store all confirmed words in a ref that never gets overwritten
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
    recognition.continuous = true;       // FIX: keep listening — do not auto-stop after one phrase
    recognition.interimResults = true;   // FIX: show words as user speaks, not only after silence
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

      let newFinalText = "";
      let currentInterim = "";
      // FIX: loop from event.resultIndex, not 0 — only process NEW results to avoid duplicating old ones
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const t = result[0].transcript;
        if (result.isFinal) {
          // FIX: only append isFinal results to the final ref — interim text is temporary
          newFinalText += t;
        } else {
          currentInterim += t;
        }
      }

      // Keep track of latest interim for emergency save on restart
      pendingInterimRef.current = currentInterim;

      if (newFinalText) {
        // FIX: append to persistent ref with a space so sentences don't merge together
        finalTranscriptRef.current = finalTranscriptRef.current + newFinalText + " ";
        // FIX: set state from the ref — the ref is the single source of truth, never overwritten
        setTranscript(finalTranscriptRef.current.trim());
        setLastFinalAt(Date.now());
      }
      // FIX: always show finalTranscript + interimTranscript together — set interim to current unconfirmed text
      setInterimTranscript(currentInterim);
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed") {
        isActiveRef.current = false;
        isRunningRef.current = false;
        setIsListening(false);
        return;
      }
      // FIX: ignore no-speech silently — do not stop listening, onend will restart if needed
      if (event.error === "no-speech") return;
      // 'aborted' is also non-fatal — onend will handle restart
      if (event.error !== "aborted") {
        console.error("[SpeechRecognition] error:", event.error);
      }
    };

    recognition.onstart = () => {
      isRunningRef.current = true;
      lastResultAtRef.current = Date.now();
    };

    recognition.onend = () => {
      isRunningRef.current = false;

      // FIX: if user is still supposed to be listening, immediately restart — prevents the gap that eats words between sentences
      if (isActiveRef.current) {
        // Save any pending interim text as final BEFORE restarting.
        // Chrome kills recognition mid-sentence, losing the interim buffer.
        if (pendingInterimRef.current.trim()) {
          const saved = pendingInterimRef.current.trim();
          // FIX: append saved interim to persistent ref so no words are lost on restart
          finalTranscriptRef.current = finalTranscriptRef.current + saved + " ";
          setTranscript(finalTranscriptRef.current.trim());
          setLastFinalAt(Date.now());
          pendingInterimRef.current = "";
          setInterimTranscript("");
        }

        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

        // FIX: restart immediately on first attempt (0ms gap = no lost words), minimal backoff only on failures
        const isFirstAttempt = restartCountRef.current === 0;
        const backoff = isFirstAttempt ? 0 : Math.min(400, 100 * restartCountRef.current);
        restartCountRef.current++;

        const doRestart = () => {
          if (!isActiveRef.current || !recognitionRef.current || isRunningRef.current) return;
          try {
            recognitionRef.current.start(); // FIX: immediately call start() again to prevent gap
            setIsListening(true);
            restartCountRef.current = 0;
          } catch {
            restartFailCountRef.current++;
            if (restartFailCountRef.current >= MAX_RESTART_FAILURES) {
              console.warn("[SpeechRecognition] Too many restart failures — recreating instance");
              recreateInstance();
            } else {
              restartTimerRef.current = setTimeout(doRestart, 300);
            }
          }
        };

        if (backoff === 0) {
          doRestart(); // FIX: zero-delay restart — no gap where words can be lost
        } else {
          restartTimerRef.current = setTimeout(doRestart, backoff);
        }
      } else {
        // Only clear interim when we're intentionally stopped
        setIsListening(false);
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
      // FIX: append to persistent ref — never overwrite accumulated words
      finalTranscriptRef.current = finalTranscriptRef.current + saved + " ";
      setTranscript(finalTranscriptRef.current.trim());
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
          // FIX: append to persistent ref — never lose words on health-check restart
          finalTranscriptRef.current = finalTranscriptRef.current + saved + " ";
          setTranscript(finalTranscriptRef.current.trim());
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
    finalTranscriptRef.current = ""; // FIX: clear the persistent ref only on explicit start — fresh recording
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

  /** Read the complete text right now — final confirmed + any pending interim, straight from refs (no React delay) */
  const getSnapshot = useCallback((): string => {
    const final = finalTranscriptRef.current.trim();
    const pending = pendingInterimRef.current.trim();
    return pending ? (final + " " + pending).trim() : final;
  }, []);

  const stop = useCallback((): string => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    isActiveRef.current = false;

    // Save any pending interim text to the persistent ref BEFORE stopping — prevents losing last words
    if (pendingInterimRef.current.trim()) {
      const saved = pendingInterimRef.current.trim();
      finalTranscriptRef.current = finalTranscriptRef.current + saved + " ";
    }

    // Snapshot the complete text BEFORE clearing anything — this is the return value
    const completeText = finalTranscriptRef.current.trim();

    // Now sync React state to match the ref
    setTranscript(completeText);
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

    // Return the complete text synchronously so callers don't depend on stale React state
    return completeText;
  }, []);

  const reset = useCallback(() => {
    finalTranscriptRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);
    pendingInterimRef.current = "";
  }, []);

  return { transcript, interimTranscript, isListening, isSupported, lastFinalAt, start, stop, reset, getSnapshot };
}
