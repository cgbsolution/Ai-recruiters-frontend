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
};

/**
 * Chrome Web Speech STT.
 *
 * APPROACH: On every onresult, rebuild the ENTIRE transcript from scratch
 * by reading ALL isFinal results in event.results. This is immune to
 * duplication because we never append — we rebuild.
 *
 * Chrome's event.results is a LIVE array of SpeechRecognitionResult objects.
 * Each result is either isFinal (confirmed) or interim (may change).
 * We read all isFinal results and join them. Any interim result is shown
 * separately as live text.
 */
export function useSpeechRecognition(language: string = "en"): SpeechRecognitionHook {
  const langTag = LANG_MAP[language] || "en-US";

  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [lastFinalAt, setLastFinalAt] = useState(0);

  const recRef = useRef<any>(null);
  const activeRef = useRef(false);
  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healthRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastResultRef = useRef(0);
  const failsRef = useRef(0);
  const langRef = useRef(langTag);
  langRef.current = langTag;

  /**
   * Text from PREVIOUS recognition sessions (before Chrome restart).
   * When Chrome restarts, event.results resets. We preserve old finals here.
   * ONLY contains isFinal text — never interim.
   */
  const previousSessionsTextRef = useRef("");

  /** Last session's finals only (no interim) — used to save on restart */
  const lastSessionFinalsRef = useRef("");

  /** Ref for current display */
  const displayRef = useRef("");

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const buildRec = useCallback(() => {
    if (!isSupported) return null;

    const API = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const r = new API();
    r.continuous = true;
    r.interimResults = true;
    r.lang = langRef.current;
    r.maxAlternatives = 1;

    r.onresult = (e: any) => {
      if (!activeRef.current) return;
      lastResultRef.current = Date.now();
      failsRef.current = 0;

      // Rebuild transcript from ALL results in this session
      const finals: string[] = [];
      let currentInterim = "";

      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim();
          if (text) finals.push(text);
        } else {
          currentInterim += e.results[i][0].transcript;
        }
      }

      // Deduplicate consecutive finals — Chrome sometimes puts the same
      // sentence in two adjacent isFinal results
      const dedupedFinals: string[] = [];
      for (const f of finals) {
        const prev = dedupedFinals[dedupedFinals.length - 1];
        if (!prev) {
          dedupedFinals.push(f);
          continue;
        }
        // Skip if this final is same as previous
        if (f.toLowerCase() === prev.toLowerCase()) continue;
        // Skip if this final starts with the same words as previous (Chrome revision)
        const prevWords = prev.toLowerCase().split(/\s+/);
        const curWords = f.toLowerCase().split(/\s+/);
        // Check if >60% of words overlap
        const overlap = prevWords.filter(w => curWords.includes(w)).length;
        if (overlap > prevWords.length * 0.6 && overlap > curWords.length * 0.6) continue;

        dedupedFinals.push(f);
      }

      const sessionFinals = dedupedFinals.join(" ");
      const fullFinals = (previousSessionsTextRef.current + " " + sessionFinals).trim();

      // Track finals-only (no interim) for saving on restart
      lastSessionFinalsRef.current = sessionFinals;

      if (sessionFinals) {
        setLastFinalAt(Date.now());
      }

      const display = currentInterim
        ? (fullFinals + " " + currentInterim).trim()
        : fullFinals;

      displayRef.current = display;
      setTranscript(display);
      setInterimTranscript(currentInterim);
    };

    r.onerror = (e: any) => {
      if (e.error === "not-allowed") {
        activeRef.current = false;
        runningRef.current = false;
        setIsListening(false);
      }
    };

    r.onstart = () => {
      runningRef.current = true;
      lastResultRef.current = Date.now();
    };

    r.onend = () => {
      runningRef.current = false;
      if (!activeRef.current) {
        setIsListening(false);
        setInterimTranscript("");
        return;
      }

      // Save ONLY confirmed finals (no interim) for the next session.
      // If we saved interim text here, Chrome would re-deliver it as a new
      // isFinal in the next session → causing duplication.
      const finalsOnly = (previousSessionsTextRef.current + " " + lastSessionFinalsRef.current).trim();
      if (finalsOnly) {
        previousSessionsTextRef.current = finalsOnly;
      }
      lastSessionFinalsRef.current = "";

      // Don't touch display — keep showing what we have
      if (timerRef.current) clearTimeout(timerRef.current);
      requestAnimationFrame(() => {
        if (!activeRef.current || runningRef.current) return;
        const rec = recRef.current;
        if (!rec) return;
        try {
          rec.lang = langRef.current;
          rec.start();
          setIsListening(true);
        } catch {
          failsRef.current++;
          if (failsRef.current < 5) {
            timerRef.current = setTimeout(() => {
              if (!activeRef.current || runningRef.current) return;
              try {
                rec.lang = langRef.current;
                rec.start();
                setIsListening(true);
              } catch {}
            }, 250);
          }
        }
      });
    };

    return r;
  }, [isSupported]);

  useEffect(() => {
    if (!isSupported) return;
    const r = buildRec();
    if (!r) return;
    recRef.current = r;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (healthRef.current) clearInterval(healthRef.current);
      activeRef.current = false;
      runningRef.current = false;
      try { r.abort(); } catch {}
    };
  }, [isSupported, buildRec]);

  useEffect(() => {
    if (healthRef.current) clearInterval(healthRef.current);
    healthRef.current = null;
    if (!isListening) return;
    healthRef.current = setInterval(() => {
      if (!activeRef.current || !recRef.current) return;
      if (Date.now() - lastResultRef.current > 5000 && runningRef.current) {
        try { recRef.current.abort(); } catch {}
      }
    }, 2500);
    return () => {
      if (healthRef.current) clearInterval(healthRef.current);
      healthRef.current = null;
    };
  }, [isListening]);

  const start = useCallback(() => {
    if (!recRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    previousSessionsTextRef.current = "";
    lastSessionFinalsRef.current = "";
    displayRef.current = "";
    failsRef.current = 0;
    lastResultRef.current = Date.now();

    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);

    activeRef.current = true;
    recRef.current.lang = langRef.current;
    try {
      recRef.current.start();
      runningRef.current = true;
      setIsListening(true);
    } catch {}
  }, []);

  const getSnapshot = useCallback((): string => {
    return displayRef.current;
  }, []);

  const stop = useCallback((): string => {
    if (timerRef.current) clearTimeout(timerRef.current);
    activeRef.current = false;

    const result = displayRef.current.trim();
    setTranscript(result);
    setInterimTranscript("");

    try { recRef.current?.abort(); } catch {}
    runningRef.current = false;
    setIsListening(false);
    return result;
  }, []);

  const reset = useCallback(() => {
    previousSessionsTextRef.current = "";
    lastSessionFinalsRef.current = "";
    displayRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);
  }, []);

  return { transcript, interimTranscript, isListening, isSupported, lastFinalAt, start, stop, reset, getSnapshot };
}
