"use client";

import { useCallback, useRef, useState } from "react";
import {
  newRecordingId,
  initMeta,
  saveChunk,
  assembleBlob,
} from "@/lib/recordingStorage";

interface VideoRecordingHook {
  isRecording: boolean;
  /** Returns a recordingId used to track/retrieve durable chunks. */
  startRecording: (
    webcamStream: MediaStream | null,
    screenStream: MediaStream | null,
  ) => string | null;
  stopRecording: () => Promise<{
    blob: Blob;
    duration: string;
    recordingId: string;
  } | null>;
  /** Returns the current recording id (if any), so callers can persist it. */
  getRecordingId: () => string | null;
}

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
// Webcam strip at bottom-center: 320x180
const CAM_WIDTH = 320;
const CAM_HEIGHT = 180;
const FPS = 15;
// Upper bound on how much of the recording we keep in the JS heap. IndexedDB is
// the durable source of truth (and what stop/recovery actually upload); the
// in-memory copy is only a last-resort fallback for when IDB itself fails. For
// a long interview, retaining every chunk in memory is a slow leak that helps
// crash the tab, so we stop retaining past this cap and rely on IDB.
const MAX_IN_MEMORY_FALLBACK_BYTES = 48 * 1024 * 1024; // 48 MB

export function useVideoRecording(): VideoRecordingHook {
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chunkIndexRef = useRef(0);
  const retainedBytesRef = useRef(0);
  const recordingIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  // Kept so we can close() it on stop. Chrome hard-caps AudioContexts per page
  // (~6); leaking one per resume eventually makes new recordings fail.
  const audioCtxRef = useRef<AudioContext | null>(null);

  const startRecording = useCallback(
    (webcamStream: MediaStream | null, screenStream: MediaStream | null): string | null => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        return recordingIdRef.current;
      }
      if (!webcamStream && !screenStream) return null;

      chunksRef.current = [];
      chunkIndexRef.current = 0;
      retainedBytesRef.current = 0;

      // Create off-screen canvas
      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }
      const canvas = canvasRef.current;
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // Create hidden video elements to feed the canvas
      if (screenStream) {
        const sv = document.createElement("video");
        sv.srcObject = screenStream;
        sv.muted = true;
        sv.playsInline = true;
        sv.play().catch(() => {});
        screenVideoRef.current = sv;
      }

      if (webcamStream) {
        const wv = document.createElement("video");
        wv.srcObject = webcamStream;
        wv.muted = true;
        wv.playsInline = true;
        wv.play().catch(() => {});
        webcamVideoRef.current = wv;
      }

      // Draw loop: screen (top) + webcam strip (bottom-center)
      drawIntervalRef.current = setInterval(() => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        const sv = screenVideoRef.current;
        const wv = webcamVideoRef.current;
        const hasCam = wv && wv.readyState >= 2;
        const hasScreen = sv && sv.readyState >= 2;

        // Screen area = top portion, webcam strip at bottom
        const screenAreaH = hasCam ? CANVAS_HEIGHT - CAM_HEIGHT : CANVAS_HEIGHT;

        // Draw screen share
        if (hasScreen) {
          const sw = sv.videoWidth || CANVAS_WIDTH;
          const sh = sv.videoHeight || CANVAS_HEIGHT;
          const scale = Math.min(CANVAS_WIDTH / sw, screenAreaH / sh);
          const dw = sw * scale;
          const dh = sh * scale;
          const dx = (CANVAS_WIDTH - dw) / 2;
          const dy = (screenAreaH - dh) / 2;
          ctx.drawImage(sv, dx, dy, dw, dh);
        }

        // Draw webcam as bottom-center strip
        if (hasCam) {
          const camY = CANVAS_HEIGHT - CAM_HEIGHT;
          const camAspect = (wv.videoWidth || 4) / (wv.videoHeight || 3);
          const drawW = Math.min(CAM_WIDTH, CAM_HEIGHT * camAspect);
          const drawX = (CANVAS_WIDTH - drawW) / 2;

          ctx.fillStyle = "#111";
          ctx.fillRect(0, camY, CANVAS_WIDTH, CAM_HEIGHT);

          ctx.strokeStyle = "rgba(255,255,255,0.3)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, camY);
          ctx.lineTo(CANVAS_WIDTH, camY);
          ctx.stroke();

          ctx.drawImage(wv, drawX, camY, drawW, CAM_HEIGHT);
        } else if (wv && !hasScreen) {
          ctx.drawImage(wv, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
      }, 1000 / FPS);

      // Capture the canvas stream
      let canvasStream: MediaStream;
      try {
        canvasStream = canvas.captureStream(FPS);
      } catch (err) {
        console.error("[useVideoRecording] canvas.captureStream failed:", err);
        if (drawIntervalRef.current) {
          clearInterval(drawIntervalRef.current);
          drawIntervalRef.current = null;
        }
        return null;
      }

      // Mix audio from webcam (mic) + screen (system/avatar) using AudioContext
      const micTracks = webcamStream ? webcamStream.getAudioTracks() : [];
      const sysTracks = screenStream ? screenStream.getAudioTracks() : [];

      if (micTracks.length > 0 || sysTracks.length > 0) {
        try {
          // Close any context left over from a previous start before opening
          // a new one, so resumes don't accumulate AudioContexts.
          if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => {});
            audioCtxRef.current = null;
          }
          const audioCtx = new AudioContext();
          audioCtxRef.current = audioCtx;
          const dest = audioCtx.createMediaStreamDestination();

          if (micTracks.length > 0) {
            const micSource = audioCtx.createMediaStreamSource(
              new MediaStream(micTracks),
            );
            micSource.connect(dest);
          }

          if (sysTracks.length > 0) {
            const sysSource = audioCtx.createMediaStreamSource(
              new MediaStream(sysTracks),
            );
            sysSource.connect(dest);
          }

          for (const track of dest.stream.getAudioTracks()) {
            canvasStream.addTrack(track);
          }
        } catch {
          for (const t of micTracks) canvasStream.addTrack(t);
          for (const t of sysTracks) canvasStream.addTrack(t);
        }
      }

      // Prefer webm/vp8
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "";

      const options = mimeType ? { mimeType } : {};
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(canvasStream, options);
      } catch (err) {
        console.error("[useVideoRecording] MediaRecorder constructor failed:", err);
        if (drawIntervalRef.current) {
          clearInterval(drawIntervalRef.current);
          drawIntervalRef.current = null;
        }
        return null;
      }

      // Mint a durable recording id and seed metadata BEFORE any chunks arrive.
      const recordingId = newRecordingId();
      recordingIdRef.current = recordingId;
      initMeta(recordingId, mimeType || "video/webm").catch(() => {});

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          // Persist to IndexedDB FIRST — this is the durable source of truth
          // that survives a tab close, crash, or upload failure, and what
          // stop/recovery actually upload. Fire-and-forget: saveChunk swallows
          // errors internally so it can never break recording.
          const idx = chunkIndexRef.current++;
          void saveChunk(recordingId, idx, e.data);
          // Additionally keep an in-memory copy as a last-resort fallback for
          // the immediate post-stop path, but only up to a bound — past it we
          // rely solely on IDB so a long interview can't leak the heap to death.
          if (retainedBytesRef.current < MAX_IN_MEMORY_FALLBACK_BYTES) {
            chunksRef.current.push(e.data);
            retainedBytesRef.current += e.data.size;
          }
        }
      };

      recorder.onerror = (e) => {
        console.error("[useVideoRecording] MediaRecorder error:", e);
      };

      recorderRef.current = recorder;
      startTimeRef.current = Date.now();
      try {
        recorder.start(1000);
      } catch (err) {
        console.error("[useVideoRecording] recorder.start() failed:", err);
        if (drawIntervalRef.current) {
          clearInterval(drawIntervalRef.current);
          drawIntervalRef.current = null;
        }
        recorderRef.current = null;
        return null;
      }
      setIsRecording(true);
      return recordingId;
    },
    [],
  );

  const stopRecording = useCallback((): Promise<{
    blob: Blob;
    duration: string;
    recordingId: string;
  } | null> => {
    return new Promise((resolve) => {
      // Stop the draw loop
      if (drawIntervalRef.current) {
        clearInterval(drawIntervalRef.current);
        drawIntervalRef.current = null;
      }

      // Clean up video elements
      if (screenVideoRef.current) {
        screenVideoRef.current.pause();
        screenVideoRef.current.srcObject = null;
        screenVideoRef.current = null;
      }
      if (webcamVideoRef.current) {
        webcamVideoRef.current.pause();
        webcamVideoRef.current.srcObject = null;
        webcamVideoRef.current = null;
      }

      const recorder = recorderRef.current;
      const recordingId = recordingIdRef.current;
      if (!recorder || recorder.state === "inactive" || !recordingId) {
        resolve(null);
        return;
      }

      const elapsedMs = Date.now() - startTimeRef.current;
      const totalSec = Math.round(elapsedMs / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      const duration = `${mins}:${secs.toString().padStart(2, "0")}`;

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || "video/webm";
        // Prefer the IDB-assembled blob because it's byte-for-byte the same
        // bytes that will survive a crash. Fall back to in-memory chunks if
        // IDB ever fails (e.g. Safari private mode).
        let blob: Blob | null = null;
        try {
          blob = await assembleBlob(recordingId);
        } catch {
          blob = null;
        }
        if (!blob || blob.size === 0) {
          blob = new Blob(chunksRef.current, { type: mimeType });
        }
        chunksRef.current = [];
        chunkIndexRef.current = 0;
        retainedBytesRef.current = 0;
        recorderRef.current = null;
        canvasRef.current = null;
        // Release the audio graph so the AudioContext doesn't leak across resumes.
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
        }
        setIsRecording(false);
        resolve({ blob, duration, recordingId });
      };

      recorder.stop();
    });
  }, []);

  const getRecordingId = useCallback(() => recordingIdRef.current, []);

  return { isRecording, startRecording, stopRecording, getRecordingId };
}
