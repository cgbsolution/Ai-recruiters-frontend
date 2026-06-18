"use client";

import { useCallback, useEffect, useRef } from "react";
import { API_BASE, sessionTokenHeader } from "@/lib/api";

const CAPTURE_INTERVAL_MS = 14_000; // Every 14 seconds (within the 13-15s range)
const JPEG_QUALITY = 0.75;          // Balance quality vs size

/**
 * Periodically captures a JPEG snapshot from the webcam stream and uploads it
 * to the backend. Runs silently in the background — never blocks the interview.
 *
 * The backend counts faces in each screenshot server-side (OpenCV), so we no
 * longer run an in-browser face detector or send a face_count from here — that
 * detector (MediaPipe, ~300 MB) was the main OOM-crash driver.
 */
export function useScreenCapture(
  sessionId: number | null,
  webcamStream: MediaStream | null,
  isActive: boolean,
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Reused across ticks on the fallback path so we don't allocate a fresh
  // decoder-backed <video> every 14s (a slow leak on weak machines).
  const fallbackVideoRef = useRef<HTMLVideoElement | null>(null);
  const isUploadingRef = useRef(false);

  const captureAndUpload = useCallback(async () => {
    if (!sessionId || !webcamStream || isUploadingRef.current) return;

    const videoTrack = webcamStream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== "live") return;

    // Set the in-flight guard at ENTRY (not just before fetch) so a slow capture
    // on a weak machine can't overlap with the next interval tick.
    isUploadingRef.current = true;
    try {
      // Lazy-create the off-screen canvas
      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }
      const canvas = canvasRef.current;

      // Use ImageCapture API if available (most modern browsers)
      if (typeof ImageCapture !== "undefined") {
        const capture = new (ImageCapture as any)(videoTrack);
        const bitmap = await (capture as any).grabFrame();
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
      } else {
        // Fallback: a single hidden video element, REUSED across ticks.
        let video = fallbackVideoRef.current;
        if (!video) {
          video = document.createElement("video");
          video.muted = true;
          (video as HTMLVideoElement & { playsInline: boolean }).playsInline = true;
          fallbackVideoRef.current = video;
        }
        if (video.srcObject == null) {
          video.srcObject = new MediaStream([videoTrack]);
          await video.play();
        }
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      // Convert to JPEG blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
      );
      if (!blob) return;

      const form = new FormData();
      form.append("file", blob, `screenshot_${Date.now()}.jpg`);
      form.append("timestamp", new Date().toISOString());

      await fetch(`${API_BASE}/interview/sessions/${sessionId}/screenshot`, {
        method: "POST",
        headers: sessionTokenHeader(),
        body: form,
      }).catch(() => {
        // Silently ignore upload errors — non-critical
      });
    } catch {
      // Silently ignore any capture errors
    } finally {
      isUploadingRef.current = false;
    }
  }, [sessionId, webcamStream]);

  useEffect(() => {
    if (!isActive || !sessionId || !webcamStream) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Start capturing after a short delay (let the interview settle first)
    const startDelay = setTimeout(() => {
      captureAndUpload(); // First capture immediately
      intervalRef.current = setInterval(captureAndUpload, CAPTURE_INTERVAL_MS);
    }, 5_000);

    return () => {
      clearTimeout(startDelay);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Release the reused fallback <video> and its stream reference.
      if (fallbackVideoRef.current) {
        try { fallbackVideoRef.current.pause(); } catch {}
        try { fallbackVideoRef.current.srcObject = null; } catch {}
        fallbackVideoRef.current = null;
      }
    };
  }, [isActive, sessionId, webcamStream, captureAndUpload]);
}
