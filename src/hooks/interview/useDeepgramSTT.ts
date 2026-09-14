"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, sessionTokenHeader } from "@/lib/api";

/** Why speech-to-text failed, at the granularity the microphone check needs to
 *  tell the candidate what to actually do about it. */
export type DeepgramErrorKind =
  | "mic_not_allowed"
  | "mic_not_found"
  | "mic_busy"
  | "recorder"
  | "token"
  | "ws";

export interface DeepgramDiagnostics {
  /** A Deepgram WebSocket is open right now. */
  connected: boolean;
  /** Deepgram's own server-side voice detection (vad_events=true) fired this
   *  many times — proof that audio carrying speech actually reached them. */
  speechStartedCount: number;
  errorKind: DeepgramErrorKind | null;
  /** HTTP status of the last /interview/deepgram-token response, if any. */
  tokenStatus: number | null;
}

interface DeepgramSTTHook {
  transcript: string;
  interimTranscript: string;
  /** Confirmed (final) transcript only — no interim text. Use this for
   *  silence detection / auto-submit decisions instead of regex-stripping
   *  the interim tail off `transcript`. */
  finalTranscript: string;
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
  /** Ref-backed diagnostics for the pre-interview microphone check. Reading
   *  them never triggers a render, so the interview room is unaffected. */
  getDiagnostics: () => DeepgramDiagnostics;
}

const DG_LANG_MAP: Record<string, string> = {
  en: "en",
  hi: "hi",
};

/** Cap on audio chunks buffered while the WebSocket is (re)connecting.
 *  100 ms chunks → 600 ≈ 60 s of audio. Past that we drop the OLDEST chunks:
 *  without a cap, a connection that never comes back grew the buffer forever. */
const MAX_BUFFERED_CHUNKS = 600;

/** Map a getUserMedia rejection to the cause the candidate can act on. */
function micErrorKind(err: unknown): DeepgramErrorKind {
  const name = (err as { name?: string } | null)?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return "mic_not_allowed";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return "mic_not_found";
  }
  // NotReadableError / AbortError / TrackStartError — and anything unknown:
  // the device exists but won't open, which in practice means another app (or
  // the OS) is holding it, so "close other apps" is the advice that helps.
  return "mic_busy";
}

/**
 * Deepgram real-time STT via WebSocket.
 * Zero duplicates. Works in all browsers.
 */
export function useDeepgramSTT(language: string = "en", sessionId?: number | null): DeepgramSTTHook {
  const dgLang = DG_LANG_MAP[language] || "en";

  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
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
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // ── Diagnostics. Refs, not state, so a voice-activity event never re-renders
  //    the interview room. Read through getDiagnostics() by DeviceTestStep.
  const startSeqRef = useRef(0);
  const connectedRef = useRef(false);
  const speechStartedRef = useRef(0);
  const errorKindRef = useRef<DeepgramErrorKind | null>(null);
  const tokenStatusRef = useRef<number | null>(null);

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
    connectedRef.current = false;
    setMicStream(null);
  }, []);

  const start = useCallback(async () => {
    if (!isSupported) return;
    cleanup();

    textRef.current = "";
    interimRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setFinalTranscript("");
    setLastFinalAt(0);
    setError(null);
    activeRef.current = true;
    // Bumped by stop(), by unmount and by every start(). The guard after the
    // getUserMedia await below uses it to tell "still the current start" from
    // "superseded while the permission prompt was open".
    const seq = ++startSeqRef.current;
    errorKindRef.current = null;
    tokenStatusRef.current = null;
    speechStartedRef.current = 0;

    // Get microphone FIRST — start recording immediately to not lose any words
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      // stop(), unmount or a second start() landed while we were awaiting the
      // permission prompt. Without this the stream and its MediaRecorder stay
      // alive forever — connect() bails on !activeRef and nothing ever stops
      // the tracks, so the browser's microphone indicator never goes off.
      if (!activeRef.current || seq !== startSeqRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setMicStream(stream);
    } catch (err) {
      console.error("[Deepgram] Microphone denied");
      errorKindRef.current = micErrorKind(err);
      activeRef.current = false;
      setIsListening(false);
      // Surface the failure — without this the UI flips to "recording" on a
      // timer and the candidate talks into a dead mic with no transcript.
      setError(
        "Microphone access was denied or the microphone is unavailable. " +
        "Please allow microphone access in your browser and try again."
      );
      return;
    }

    // Start recording immediately — buffer audio while WebSocket connects
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const audioBuffer: Blob[] = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch (err) {
      console.error("[Deepgram] MediaRecorder construction failed:", err);
      errorKindRef.current = "recorder";
      activeRef.current = false;
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setMicStream(null);
      setError("Microphone recording unavailable on this device. Please try a different browser.");
      return;
    }
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && activeRef.current) {
        audioBuffer.push(e.data);
        // Bound the buffer while disconnected — drop the oldest audio rather
        // than growing the heap forever on a connection that never recovers.
        while (audioBuffer.length > MAX_BUFFERED_CHUNKS) audioBuffer.shift();
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
    try {
      recorder.start(100);
    } catch (err) {
      console.error("[Deepgram] recorder.start() failed:", err);
      errorKindRef.current = "recorder";
      activeRef.current = false;
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setMicStream(null);
      setError("Microphone recording could not start. Please reload and try again.");
      return;
    }
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

    // The backend now requires an active session id (and the session token)
    // and returns a SHORT-LIVED scoped Deepgram token (scheme "bearer"); the
    // raw master key (scheme "token") only comes back if the grant API is down.
    const fetchKey = async (): Promise<{ key: string; scheme: string } | null> => {
      try {
        const sid = sessionIdRef.current;
        const res = await fetch(
          `${API_BASE}/interview/deepgram-token${sid ? `?session_id=${sid}` : ""}`,
          { headers: sessionTokenHeader() },
        );
        // Kept for the microphone check: 401/403 means the session itself is
        // bad (reload), while 429/5xx means our service is down (don't block).
        tokenStatusRef.current = res.status;
        const data = await res.json();
        if (!data.key) return null;
        return { key: data.key, scheme: data.scheme === "bearer" ? "bearer" : "token" };
      } catch {
        return null;
      }
    };

    const connect = async () => {
      if (!activeRef.current) return;
      const key = await fetchKey();
      if (!activeRef.current) return; // stopped while fetching the token
      if (!key) {
        // warn, not error — this retries (and is surfaced to the user via the
        // STT error banner if it ultimately fails). Avoids the dev overlay.
        console.warn("[Deepgram] Failed to get API key — retrying");
        if (reconnectAttempts < MAX_RECONNECTS) {
          reconnectAttempts += 1;
          setTimeout(() => { if (activeRef.current) void connect(); }, 500 * reconnectAttempts);
        } else {
          errorKindRef.current = "token";
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
        [key.scheme, key.key]
      );
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempts = 0;
        connectedRef.current = true;
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
          // vad_events=true: Deepgram's own start-of-speech detection. The
          // interview ignores it; the microphone check uses it as proof that
          // audio carrying real speech reached Deepgram, which is what tells a
          // dead microphone apart from a merely poor transcription.
          if (msg.type === "SpeechStarted") {
            speechStartedRef.current += 1;
            return;
          }
          if (msg.type === "Results") {
            const alt = msg.channel?.alternatives?.[0];
            if (!alt) return;
            const text = (alt.transcript || "").trim();
            if (!text) return;

            if (msg.is_final) {
              textRef.current = (textRef.current + " " + text).trim();
              interimRef.current = "";
              setTranscript(textRef.current);
              setFinalTranscript(textRef.current);
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

      // NOTE: use console.warn, NOT console.error. A transient WebSocket error
      // (Deepgram routinely closes idle sockets; onclose then reconnects) is
      // expected and self-healing — it is NOT a fatal condition. In Next.js dev
      // mode console.error raises a full-screen blocking error overlay that
      // covers the interview UI and makes STT appear "dead," even though the
      // socket reconnects fine (production has no such overlay). Downgrading to
      // warn keeps the diagnostic without hijacking the UI.
      ws.onerror = () => console.warn("[Deepgram] WebSocket error (will auto-reconnect if unexpected)");

      ws.onclose = (e) => {
        connectedRef.current = false;
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
          errorKindRef.current = "ws";
          setError("Transcription stopped (the speech service kept disconnecting). This is often an API quota/credit issue — please contact support.");
          setIsListening(false);
          // Nothing will consume further audio — stop the recorder and release
          // the mic so we don't burn CPU/battery recording into the void.
          activeRef.current = false;
          if (recorderRef.current && recorderRef.current.state !== "inactive") {
            try { recorderRef.current.stop(); } catch {}
          }
          recorderRef.current = null;
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
          setMicStream(null);
        }
      };
    };

    await connect();
  }, [isSupported, cleanup]);

  const stop = useCallback((): string => {
    activeRef.current = false;
    // Invalidate any start() still awaiting getUserMedia, so the stream it is
    // about to receive is stopped instead of leaking.
    startSeqRef.current += 1;
    cleanup();

    // Save any pending interim
    const pending = interimRef.current.trim();
    if (pending) {
      textRef.current = (textRef.current + " " + pending).trim();
    }

    const result = textRef.current.trim();
    setTranscript(result);
    setFinalTranscript(result);
    setInterimTranscript("");
    interimRef.current = "";
    setIsListening(false);
    return result;
  }, [cleanup]);

  const reset = useCallback(() => {
    textRef.current = "";
    interimRef.current = "";
    setTranscript("");
    setFinalTranscript("");
    setInterimTranscript("");
    setLastFinalAt(0);
  }, []);

  const getSnapshot = useCallback((): string => {
    return (textRef.current + " " + interimRef.current).trim();
  }, []);

  const getDiagnostics = useCallback((): DeepgramDiagnostics => ({
    connected: connectedRef.current,
    speechStartedCount: speechStartedRef.current,
    errorKind: errorKindRef.current,
    tokenStatus: tokenStatusRef.current,
  }), []);

  useEffect(() => {
    return () => { activeRef.current = false; startSeqRef.current += 1; cleanup(); };
  }, [cleanup]);

  return { transcript, interimTranscript, finalTranscript, isListening, isSupported, lastFinalAt, micStream, error, start, stop, reset, getSnapshot, getDiagnostics };
}
