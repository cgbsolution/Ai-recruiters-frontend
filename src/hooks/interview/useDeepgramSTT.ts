"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

interface DeepgramSTTHook {
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
  isSupported: boolean;
  lastFinalAt: number;
  /** Currently active microphone stream. Exposed so a visualizer can wrap
   *  it in a MediaStreamAudioSourceNode for real-time amplitude data. Null
   *  when the mic is not active. */
  micStream: MediaStream | null;
  /** Non-null when speech-to-text is failing (key/quota/connection) so the UI
   *  can tell the candidate instead of leaving them silently un-transcribed. */
  error: string | null;
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
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setMicStream(null);
  }, []);

  const start = useCallback(async () => {
    if (!isSupported) return;
    cleanup();

    textRef.current = "";
    interimRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);
    setError(null);
    activeRef.current = true;

    // Get microphone FIRST — start recording immediately to not lose any words
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;
      setMicStream(stream);
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

    // ── Connect to Deepgram, with AUTO-RECONNECT on unexpected drops ──────────
    // Deepgram can close the socket mid-utterance (idle timeout, transient
    // network, code 1005). Previously onclose just gave up — the candidate kept
    // talking but nothing was transcribed, so they could never submit an answer
    // and the interview stalled right after the opening question. Now we
    // reconnect (re-fetching a fresh token) while still active; the running
    // MediaRecorder keeps buffering audio and flushes it once the new socket
    // opens, so words spoken during the gap aren't lost.
    let reconnectAttempts = 0;
    const MAX_RECONNECTS = 5;

    const fetchKey = async (): Promise<string | null> => {
      try {
        const res = await fetch(`${API_BASE}/interview/deepgram-token`);
        const data = await res.json();
        return data.key || null;
      } catch {
        return null;
      }
    };

    const connect = async () => {
      if (!activeRef.current) return;
      const key = await fetchKey();
      if (!activeRef.current) return; // stopped while fetching the token
      if (!key) {
        console.error("[Deepgram] Failed to get API key");
        if (reconnectAttempts < MAX_RECONNECTS) {
          reconnectAttempts += 1;
          setTimeout(() => { if (activeRef.current) void connect(); }, 500 * reconnectAttempts);
        } else {
          setError("Transcription service unavailable (could not authorize). Please check your connection or contact support.");
        }
        return;
      }

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
        reconnectAttempts = 0;
        setError(null);
        setIsListening(true);
        // Flush audio buffered while (re)connecting so no words are lost.
        while (audioBuffer.length > 0) {
          const chunk = audioBuffer.shift()!;
          try { ws.send(chunk); } catch {}
        }
      };

      ws.onmessage = (event) => {
        if (!activeRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "Results") {
            const alt = msg.channel?.alternatives?.[0];
            if (!alt) return;
            const text = (alt.transcript || "").trim();
            if (!text) return;

            if (msg.is_final) {
              textRef.current = (textRef.current + " " + text).trim();
              interimRef.current = "";
              setTranscript(textRef.current);
              setInterimTranscript("");
              setLastFinalAt(Date.now());
            } else {
              interimRef.current = text;
              setTranscript((textRef.current + " " + text).trim());
              setInterimTranscript(text);
            }
          }
        } catch {}
      };

      ws.onerror = () => console.error("[Deepgram] WebSocket error");

      ws.onclose = (e) => {
        // Intentional stop() sets activeRef=false BEFORE closing — don't reconnect.
        if (!activeRef.current) {
          setIsListening(false);
          return;
        }
        // Unexpected drop while still listening → reconnect so transcription
        // (and the candidate's ability to answer) survives the blip.
        if (wsRef.current === ws) wsRef.current = null;
        if (reconnectAttempts < MAX_RECONNECTS) {
          reconnectAttempts += 1;
          console.warn(`[Deepgram] Closed unexpectedly (code ${e.code}) — reconnecting (${reconnectAttempts}/${MAX_RECONNECTS})`);
          setTimeout(() => { if (activeRef.current) void connect(); }, Math.min(2000, 300 * reconnectAttempts));
        } else {
          console.error(`[Deepgram] Reconnect attempts exhausted — STT stopped (last close code ${e.code})`);
          setError("Transcription stopped (the speech service kept disconnecting). This is often an API quota/credit issue — please contact support.");
          setIsListening(false);
        }
      };
    };

    await connect();
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

  return { transcript, interimTranscript, isListening, isSupported, lastFinalAt, micStream, error, start, stop, reset, getSnapshot };
}
