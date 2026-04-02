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
 */
const HEALTH_CHECK_INTERVAL_MS = 3000;
const MAX_DEAD_TIME_MS = 5000;

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

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      // Guard: discard results when recognition is supposed to be stopped.
      // This prevents TTS audio from being transcribed as user input.
      if (!isActiveRef.current) return;

      // Track that we're receiving results (for health check)
      lastResultAtRef.current = Date.now();
      // Reset restart backoff on successful results
      restartCountRef.current = 0;

      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const t = result[0].transcript;
        if (result.isFinal) {
          // Only accept final results with reasonable confidence
          const confidence = result[0].confidence ?? 1;
          if (confidence >= 0.4) {
            finalText += t;
          }
        } else {
          interimText += t;
        }
      }
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
      // IMPORTANT: Do NOT clear interimTranscript here — it causes text to
      // disappear briefly during auto-restarts. Only clear it when we get
      // new results or when explicitly stopped.

      // Auto-restart if we're supposed to be listening
      if (isActiveRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

        // Exponential backoff: 100ms, 200ms, 400ms, max 1000ms
        const backoff = Math.min(1000, 100 * Math.pow(2, restartCountRef.current));
        restartCountRef.current++;

        restartTimerRef.current = setTimeout(() => {
          if (isActiveRef.current && recognitionRef.current && !isRunningRef.current) {
            try {
              recognitionRef.current.start();
              setIsListening(true);
            } catch {
              // Already started or other error — retry once more after a delay
              setTimeout(() => {
                if (isActiveRef.current && recognitionRef.current && !isRunningRef.current) {
                  try {
                    recognitionRef.current.start();
                    setIsListening(true);
                  } catch {
                    // Give up this cycle — health check will retry
                  }
                }
              }, 500);
            }
          }
        }, backoff);
      } else {
        // Only clear interim when we're intentionally stopped
        setInterimTranscript("");
      }
    };

    recognitionRef.current = recognition;

    return () => {
      isActiveRef.current = false;
      isRunningRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (healthCheckRef.current) clearInterval(healthCheckRef.current);
      recognition.abort();
    };
  }, [isSupported]);

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

      // If we haven't received any result in MAX_DEAD_TIME_MS and we should
      // be listening, force a restart
      if (timeSinceResult > MAX_DEAD_TIME_MS && isRunningRef.current) {
        console.warn(
          `[SpeechRecognition] No results for ${timeSinceResult}ms — force-restarting`
        );
        isRunningRef.current = false;
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
        // onend handler will auto-restart
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    return () => {
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
        healthCheckRef.current = null;
      }
    };
  }, [isListening]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    isActiveRef.current = true;
    restartCountRef.current = 0;
    lastResultAtRef.current = Date.now();
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
    // Intentionally preserve transcript (final text) so callers can read it
    // after stopping. Use reset() to explicitly clear when starting fresh.
    setInterimTranscript("");
    setLastFinalAt(0);
    if (recognitionRef.current) {
      try {
        // Use abort() instead of stop() — abort discards any buffered audio
        // immediately, preventing TTS echo from being transcribed as user input
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
  }, []);

  return { transcript, interimTranscript, isListening, isSupported, lastFinalAt, start, stop, reset };
}
