"use client";

import { useCallback, useEffect, useRef } from "react";
import { API_BASE } from "@/lib/api";

const CAPTURE_INTERVAL_MS = 14_000; // Every 14 seconds (within the 13-15s range)
const JPEG_QUALITY = 0.75;          // Balance quality vs size

/**
 * Periodically captures a JPEG snapshot from the webcam stream and uploads it
 * to the backend. Runs silently in the background — never blocks the interview.
 */
export function useScreenCapture(
  sessionId: number | null,
  webcamStream: MediaStream | null,
  isActive: boolean,
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isUploadingRef = useRef(false);

  const captureAndUpload = useCallback(async () => {
    if (!sessionId || !webcamStream || isUploadingRef.current) return;

    const videoTrack = webcamStream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== "live") return;

    // Lazy-create the off-screen canvas
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;

    try {
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
        // Fallback: use a hidden video element to snapshot the stream
        const video = document.createElement("video");
        video.srcObject = new MediaStream([videoTrack]);
        video.muted = true;
        await video.play();
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        video.pause();
        video.srcObject = null;
      }

      // Convert to JPEG blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
      );
      if (!blob) return;

      isUploadingRef.current = true;
      const form = new FormData();
      form.append("file", blob, `screenshot_${Date.now()}.jpg`);
      form.append("timestamp", new Date().toISOString());

      // Fire-and-forget — never await to block the interview
      fetch(`${API_BASE}/interview/sessions/${sessionId}/screenshot`, {
        method: "POST",
        body: form,
      }).catch(() => {
        // Silently ignore upload errors — non-critical
      }).finally(() => {
        isUploadingRef.current = false;
      });
    } catch {
      isUploadingRef.current = false;
      // Silently ignore any capture errors
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
    };
  }, [isActive, sessionId, webcamStream, captureAndUpload]);
}
