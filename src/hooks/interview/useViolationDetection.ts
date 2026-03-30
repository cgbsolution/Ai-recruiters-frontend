"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

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
  lastFaceCountRef: React.MutableRefObject<number>;
}

const TERMINATE_THRESHOLD = 5;

export function useViolationDetection(
  sessionId: number | null,
  isActive: boolean,
  webcamStream: MediaStream | null,
  faceMatchEnabled: boolean = true
): ViolationDetectionHook {
  const [violationCount, setViolationCount] = useState(0);
  const [lastViolation, setLastViolation] = useState<ViolationType | null>(null);
  const [shouldTerminate, setShouldTerminate] = useState(false);
  const disabledRef = useRef(false);
  const lastFaceCountRef = useRef<number>(1); // latest face count from MediaPipe
  const faceDetectorRef = useRef<any>(null);
  const faceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const disable = useCallback(() => {
    disabledRef.current = true;
  }, []);

  const terminatedRef = useRef(false);

  const reportViolation = useCallback(
    async (type: ViolationType, details?: string) => {
      if (!sessionId || disabledRef.current || terminatedRef.current) return;
      setLastViolation(type);
      setViolationCount((prev) => {
        const next = prev + 1;
        if (next >= TERMINATE_THRESHOLD) {
          terminatedRef.current = true;
          setShouldTerminate(true);
        }
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

  // MediaPipe face detection (only when face_match is enabled)
  const consecutiveMissRef = useRef(0);
  const MISS_THRESHOLD = 3; // need 3 consecutive "no face" checks before violation

  useEffect(() => {
    if (!isActive || !webcamStream || !faceMatchEnabled) return;

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
          minDetectionConfidence: 0.35,
        });

        faceDetection.onResults((results: any) => {
          if (!isActive || cancelled) return;
          const count = results.detections?.length ?? 0;
          lastFaceCountRef.current = count;
          if (count === 0) {
            consecutiveMissRef.current += 1;
            if (consecutiveMissRef.current >= MISS_THRESHOLD) {
              reportViolation("face_not_detected", "No face visible in webcam");
              consecutiveMissRef.current = 0; // reset after reporting
            }
          } else if (count > 1) {
            consecutiveMissRef.current = 0;
            reportViolation("multiple_faces", `${count} faces detected in frame`);
          } else {
            consecutiveMissRef.current = 0; // face found, reset counter
          }
        });

        faceDetectorRef.current = faceDetection;

        // Create video element to feed frames to MediaPipe
        const video = document.createElement("video");
        video.srcObject = webcamStream;
        video.width = 640;
        video.height = 480;
        video.muted = true;
        video.playsInline = true;
        videoRef.current = video;

        // Explicitly play and wait for it to be ready
        await video.play();

        // Wait for video to be ready + give MediaPipe model time to load
        await new Promise((r) => setTimeout(r, 5000));

        // Run detection every 4 seconds
        faceIntervalRef.current = setInterval(async () => {
          if (cancelled || !faceDetectorRef.current || video.readyState < 2) return;
          try {
            await faceDetectorRef.current.send({ image: video });
          } catch {
            // silently ignore frame errors
          }
        }, 4000);
      } catch (e) {
        console.warn("MediaPipe face detection unavailable:", e);
      }
    };

    initFaceDetection();

    return () => {
      cancelled = true;
      if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
    };
  }, [isActive, webcamStream, faceMatchEnabled, reportViolation]);

  const resetViolations = useCallback(() => {
    setViolationCount(0);
    setLastViolation(null);
    setShouldTerminate(false);
  }, []);

  return { violationCount, lastViolation, shouldTerminate, resetViolations, disable, lastFaceCountRef };
}
