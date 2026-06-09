"use client";

import { useCallback, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

/** Language code → Whisper language */
const WHISPER_LANG_MAP: Record<string, string> = {
  en: "en",
  hi: "hi",
  ar: "ar",
  hinglish: "hi",
};

interface WhisperSTTHook {
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

/**
 * Whisper-based STT: records audio via MediaRecorder, sends chunks
 * to the backend /interview/transcribe endpoint every few seconds.
 */
export function useWhisperSTT(language: string = "en"): WhisperSTTHook {
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [lastFinalAt, setLastFinalAt] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActiveRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const pendingRef = useRef("");

  const isSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const whisperLang = WHISPER_LANG_MAP[language] || "en";

  /** Send accumulated audio chunks to Whisper API */
  const flushChunks = useCallback(async () => {
    if (chunksRef.current.length === 0) return;

    const blob = new Blob(chunksRef.current, { type: "audio/webm;codecs=opus" });
    chunksRef.current = [];

    // Skip tiny chunks (silence/noise)
    if (blob.size < 1000) return;

    const formData = new FormData();
    formData.append("audio", blob, "audio.webm");
    formData.append("language", whisperLang);

    try {
      const res = await fetch(`${API_BASE}/interview/transcribe`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.text && data.text.trim()) {
        const newText = data.text.trim();
        // Append to accumulated transcript
        finalTranscriptRef.current = (finalTranscriptRef.current + " " + newText).trim();
        setTranscript(finalTranscriptRef.current);
        setInterimTranscript("");
        setLastFinalAt(Date.now());
        pendingRef.current = "";
      }
    } catch (err) {
      console.warn("[WhisperSTT] Transcription request failed:", err);
    }
  }, [whisperLang]);

  const start = useCallback(async () => {
    if (!isSupported) return;

    // Reset state
    finalTranscriptRef.current = "";
    pendingRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);
    chunksRef.current = [];
    isActiveRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && isActiveRef.current) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.start(3000); // Collect chunks every 3 seconds
      mediaRecorderRef.current = recorder;
      setIsListening(true);

      // Show "listening" indicator
      setInterimTranscript("…");

      // Flush to Whisper every 4 seconds (gives time for 3s chunk to arrive)
      intervalRef.current = setInterval(() => {
        if (isActiveRef.current) {
          setInterimTranscript("…"); // Show activity indicator
          flushChunks();
        }
      }, 4000);
    } catch (err) {
      console.error("[WhisperSTT] Failed to start recording:", err);
      isActiveRef.current = false;
      // Release the mic track — without this the browser keeps the mic indicator
      // lit and the track is never GC'd even though recording never started.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    }
  }, [isSupported, flushChunks]);

  const stop = useCallback((): string => {
    isActiveRef.current = false;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Do one final flush synchronously by capturing remaining chunks
    // (the actual transcription will happen async, but we return what we have)
    setIsListening(false);
    setInterimTranscript("");

    // Flush remaining chunks (fire and forget)
    if (chunksRef.current.length > 0) {
      const blob = new Blob(chunksRef.current, { type: "audio/webm;codecs=opus" });
      chunksRef.current = [];
      if (blob.size >= 1000) {
        const formData = new FormData();
        formData.append("audio", blob, "audio.webm");
        formData.append("language", whisperLang);
        fetch(`${API_BASE}/interview/transcribe`, { method: "POST", body: formData })
          .then((r) => r.json())
          .then((data) => {
            if (data.text?.trim()) {
              finalTranscriptRef.current = (finalTranscriptRef.current + " " + data.text.trim()).trim();
              setTranscript(finalTranscriptRef.current);
              setLastFinalAt(Date.now());
            }
          })
          .catch(() => {});
      }
    }

    return finalTranscriptRef.current;
  }, [whisperLang]);

  const reset = useCallback(() => {
    finalTranscriptRef.current = "";
    pendingRef.current = "";
    chunksRef.current = [];
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);
  }, []);

  const getSnapshot = useCallback((): string => {
    return finalTranscriptRef.current.trim();
  }, []);

  return {
    transcript,
    interimTranscript,
    isListening,
    isSupported,
    lastFinalAt,
    start,
    stop,
    reset,
    getSnapshot,
  };
}
