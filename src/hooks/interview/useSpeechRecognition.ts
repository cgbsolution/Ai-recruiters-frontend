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

export function useSpeechRecognition(): SpeechRecognitionHook {
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [lastFinalAt, setLastFinalAt] = useState(0);
  const recognitionRef = useRef<any>(null);
  const isActiveRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        setIsListening(false);
        return;
      }
      // 'no-speech' and 'aborted' are non-fatal — onend will handle restart
      if (event.error !== "no-speech" && event.error !== "aborted") {
        console.error("Speech recognition error:", event.error);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
      // Auto-restart if we're supposed to be listening
      if (isActiveRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (isActiveRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
              setIsListening(true);
            } catch {
              // Already started or other error — ignore
            }
          }
        }, 300);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      isActiveRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      recognition.abort();
    };
  }, [isSupported]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    isActiveRef.current = true;
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);
    try {
      recognitionRef.current.start();
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
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);
  }, []);

  return { transcript, interimTranscript, isListening, isSupported, lastFinalAt, start, stop, reset };
}
