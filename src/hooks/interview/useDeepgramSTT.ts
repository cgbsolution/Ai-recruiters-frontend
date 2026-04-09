"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

interface DeepgramSTTHook {
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

const DG_LANG_MAP: Record<string, string> = {
  en: "en",
  hi: "hi",
};

/**
 * Deepgram real-time STT via WebSocket.
 * Zero duplicates. Works in all browsers.
 */
export function useDeepgramSTT(language: string = "en"): DeepgramSTTHook {
  const dgLang = DG_LANG_MAP[language] || "en";

  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [lastFinalAt, setLastFinalAt] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(false);
  const textRef = useRef("");
  const interimRef = useRef("");
  const langRef = useRef(dgLang);
  langRef.current = dgLang;

  const isSupported =
    typeof window !== "undefined" &&
    !!navigator?.mediaDevices?.getUserMedia &&
    typeof WebSocket !== "undefined";

  const cleanup = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch {}
    }
    recorderRef.current = null;

    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
    }
    wsRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (!isSupported) return;
    cleanup();

    textRef.current = "";
    interimRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);
    activeRef.current = true;

    // Get microphone FIRST — start recording immediately to not lose any words
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;
    } catch {
      console.error("[Deepgram] Microphone denied");
      activeRef.current = false;
      return;
    }

    // Start recording immediately — buffer audio while WebSocket connects
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const audioBuffer: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && activeRef.current) {
        audioBuffer.push(e.data);
        // If WebSocket is open, send immediately
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          // Send any buffered chunks first
          while (audioBuffer.length > 0) {
            const chunk = audioBuffer.shift()!;
            wsRef.current.send(chunk);
          }
        }
      }
    };
    recorder.start(100);
    recorderRef.current = recorder;
    setIsListening(true);

    // Get API key from backend (in parallel with recording start)
    let key: string;
    try {
      const res = await fetch(`${API_BASE}/interview/deepgram-token`);
      const data = await res.json();
      key = data.key;
      if (!key) throw new Error("No key");
    } catch {
      console.error("[Deepgram] Failed to get API key");
      activeRef.current = false;
      cleanup();
      return;
    }

    // Connect to Deepgram — buffered audio will be sent once connected
    const ws = new WebSocket(
      `wss://api.deepgram.com/v1/listen?` +
      `model=nova-2&` +
      `language=${langRef.current}&` +
      `smart_format=true&` +
      `punctuate=true&` +
      `interim_results=true&` +
      `utterance_end_ms=1500&` +
      `vad_events=true`,
      ["token", key]
    );
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[Deepgram] Connected — flushing", audioBuffer.length, "buffered chunks");
      // Flush all buffered audio that was recorded while WebSocket was connecting
      while (audioBuffer.length > 0) {
        const chunk = audioBuffer.shift()!;
        ws.send(chunk);
      }
    };

    ws.onmessage = (event) => {
      if (!activeRef.current) return;
      try {
        const msg = JSON.parse(event.data);

        // Handle transcript results
        if (msg.type === "Results") {
          const alt = msg.channel?.alternatives?.[0];
          if (!alt) return;
          const text = (alt.transcript || "").trim();
          if (!text) return;

          if (msg.is_final) {
            // Final — append confirmed words
            textRef.current = (textRef.current + " " + text).trim();
            interimRef.current = "";
            // Display = just finals (interim was part of this final, so no loss)
            setTranscript(textRef.current);
            setInterimTranscript("");
            setLastFinalAt(Date.now());
          } else {
            // Interim — show finals + this interim as one seamless display
            interimRef.current = text;
            setTranscript((textRef.current + " " + text).trim());
            setInterimTranscript(text);
          }
        }
      } catch {}
    };

    ws.onerror = () => console.error("[Deepgram] WebSocket error");
    ws.onclose = (e) => {
      console.log("[Deepgram] Closed:", e.code);
      setIsListening(false);
    };
  }, [isSupported, cleanup]);

  const stop = useCallback((): string => {
    activeRef.current = false;
    cleanup();

    // Save any pending interim
    const pending = interimRef.current.trim();
    if (pending) {
      textRef.current = (textRef.current + " " + pending).trim();
    }

    const result = textRef.current.trim();
    setTranscript(result);
    setInterimTranscript("");
    interimRef.current = "";
    setIsListening(false);
    return result;
  }, [cleanup]);

  const reset = useCallback(() => {
    textRef.current = "";
    interimRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);
  }, []);

  const getSnapshot = useCallback((): string => {
    return (textRef.current + " " + interimRef.current).trim();
  }, []);

  useEffect(() => {
    return () => { activeRef.current = false; cleanup(); };
  }, [cleanup]);

  return { transcript, interimTranscript, isListening, isSupported, lastFinalAt, start, stop, reset, getSnapshot };
}
