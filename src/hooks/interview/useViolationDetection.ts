"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ViolationType =
  | "tab_switch"
  | "fullscreen_exit"
  | "face_not_detected"
  | "multiple_faces";

interface ViolationDetectionHook {
  violationCount: number;
  lastViolation: ViolationType | null;
  shouldTerminate: boolean;
  resetViolations: () => void;
  disable: () => void;
}

const TERMINATE_THRESHOLD = 5;
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export function useViolationDetection(
  sessionId: number | null,
  isActive: boolean,
  webcamStream: MediaStream | null
): ViolationDetectionHook {
  const [violationCount, setViolationCount] = useState(0);
  const [lastViolation, setLastViolation] = useState<ViolationType | null>(null);
  const [shouldTerminate, setShouldTerminate] = useState(false);
  const disabledRef = useRef(false);
  const faceDetectorRef = useRef<any>(null);
  const faceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const disable = useCallback(() => {
    disabledRef.current = true;
  }, []);

  const reportViolation = useCallback(
    async (type: ViolationType, details?: string) => {
      if (!sessionId || disabledRef.current) return;
      setLastViolation(type);
      setViolationCount((prev) => {
        const next = prev + 1;
        if (next >= TERMINATE_THRESHOLD) setShouldTerminate(true);
        return next;
      });

      try {
        await fetch(`${API_BASE}/interview/sessions/${sessionId}/violation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ violation_type: type, details }),
        });
      } catch (e) {
        console.error("Failed to report violation:", e);
      }
    },
    [sessionId]
  );

  // Tab visibility detection
  useEffect(() => {
    if (!isActive) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        reportViolation("tab_switch", "Candidate switched tabs or minimized window");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isActive, reportViolation]);

  // Fullscreen exit detection
  useEffect(() => {
    if (!isActive) return;

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        reportViolation("fullscreen_exit", "Candidate exited fullscreen mode");
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [isActive, reportViolation]);

  // MediaPipe face detection
  useEffect(() => {
    if (!isActive || !webcamStream) return;

    let cancelled = false;

    const initFaceDetection = async () => {
      try {
        const { FaceDetection } = await import("@mediapipe/face_detection");

        const faceDetection = new FaceDetection({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`,
        });

        faceDetection.setOptions({
          model: "short",
          minDetectionConfidence: 0.5,
        });

        faceDetection.onResults((results: any) => {
          if (!isActive || cancelled) return;
          const count = results.detections?.length ?? 0;
          if (count === 0) {
            reportViolation("face_not_detected", "No face visible in webcam");
          } else if (count > 1) {
            reportViolation("multiple_faces", `${count} faces detected in frame`);
          }
        });

        faceDetectorRef.current = faceDetection;

        // Create hidden video element to feed frames
        const video = document.createElement("video");
        video.srcObject = webcamStream;
        video.autoplay = true;
        video.muted = true;
        videoRef.current = video;

        // Run detection every 3 seconds
        faceIntervalRef.current = setInterval(async () => {
          if (cancelled || !faceDetectorRef.current || video.readyState < 2) return;
          try {
            await faceDetectorRef.current.send({ image: video });
          } catch (e) {
            // silently ignore frame errors
          }
        }, 3000);
      } catch (e) {
        console.warn("MediaPipe face detection unavailable:", e);
      }
    };

    initFaceDetection();

    return () => {
      cancelled = true;
      if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
    };
  }, [isActive, webcamStream, reportViolation]);

  const resetViolations = useCallback(() => {
    setViolationCount(0);
    setLastViolation(null);
    setShouldTerminate(false);
  }, []);

  return { violationCount, lastViolation, shouldTerminate, resetViolations, disable };
}
