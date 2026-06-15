"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, sessionTokenHeader } from "@/lib/api";

export type ViolationType =
  | "tab_switch"
  | "fullscreen_exit"
  | "face_not_detected"
  | "multiple_faces"
  | "screen_share_stopped";

interface ViolationDetectionHook {
  violationCount: number;
  lastViolation: ViolationType | null;
  shouldTerminate: boolean;
  resetViolations: () => void;
  disable: () => void;
  lastFaceCountRef: React.MutableRefObject<number>;
  /** Report a violation explicitly (e.g. screen-share stopped, detected by the room). */
  reportViolation: (type: ViolationType, details?: string) => Promise<void>;
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
        const res = await fetch(`${API_BASE}/interview/sessions/${sessionId}/violation`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...sessionTokenHeader() },
          body: JSON.stringify({ violation_type: type, details }),
        });
        // The server count is authoritative (it survives page refreshes, which
        // reset the local counter). Sync it back, and honour the server's
        // termination verdict — previously the response was discarded, so a
        // candidate could refresh past violation #5 and keep interviewing.
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && typeof data.total_violations === "number") {
            setViolationCount(data.total_violations);
            if (data.should_terminate && !terminatedRef.current) {
              terminatedRef.current = true;
              setShouldTerminate(true);
            }
          }
        }
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
      // Delay MediaPipe init so the interview room can finish loading its own
      // resources first (WebSockets, webcam, screen share, TTS, GLTF avatar).
      // Loading MediaPipe's WASM + model (~300 MB) while everything else is
      // initialising simultaneously is what triggers the OOM crash on low-RAM laptops.
      await new Promise((r) => setTimeout(r, 12_000));
      if (cancelled) return;

      // Skip MediaPipe entirely on 4 GB-class devices: its ~300 MB WASM/model
      // footprint is the primary OOM-crash driver there, and most of it lives
      // OUTSIDE the JS heap where the ratio check below can't see it. Other
      // proctoring signals (tab switch, fullscreen, screenshots) still apply.
      const _devMem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      if (typeof _devMem === "number" && _devMem <= 4) {
        console.warn(
          `[ViolationDetection] Skipping MediaPipe — low-spec device (deviceMemory=${_devMem} GB)`
        );
        return;
      }

      // Skip face detection entirely when the heap is already under pressure.
      // MediaPipe adds ~300 MB; if usedJSHeap / jsHeapSizeLimit > 0.50 before
      // we even start, loading it will almost certainly kill the tab.
      const perfMem = (performance as Performance & {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
      }).memory;
      if (perfMem && perfMem.jsHeapSizeLimit > 0) {
        const ratio = perfMem.usedJSHeapSize / perfMem.jsHeapSizeLimit;
        if (ratio > 0.50) {
          console.warn(
            `[ViolationDetection] Skipping MediaPipe — heap already at ${Math.round(ratio * 100)}% (threshold 50%)`
          );
          return;
        }
      }

      try {
        const { FaceDetection } = await import("@mediapipe/face_detection");
        if (cancelled) return;

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
              consecutiveMissRef.current = 0;
            }
          } else if (count > 1) {
            consecutiveMissRef.current = 0;
            reportViolation("multiple_faces", `${count} faces detected in frame`);
          } else {
            consecutiveMissRef.current = 0;
          }
        });

        faceDetectorRef.current = faceDetection;

        // Low-resolution canvas for MediaPipe input.
        // Full-res webcam (up to 1920×1080) wastes CPU; 320×240 is sufficient.
        const video = document.createElement("video");
        video.srcObject = webcamStream;
        video.muted = true;
        video.playsInline = true;
        videoRef.current = video;

        const offCanvas = document.createElement("canvas");
        offCanvas.width = 320;
        offCanvas.height = 240;
        const offCtx = offCanvas.getContext("2d");

        await video.play();
        if (cancelled) return;

        // Give MediaPipe WASM time to JIT-compile before first send.
        await new Promise((r) => setTimeout(r, 3_000));
        if (cancelled) return;

        // 15-second interval — enough to catch sustained violations without
        // hammering the CPU/GPU on low-end devices that are already under load.
        faceIntervalRef.current = setInterval(async () => {
          if (cancelled || !faceDetectorRef.current || video.readyState < 2 || !offCtx) return;
          try {
            offCtx.drawImage(video, 0, 0, 320, 240);
            await faceDetectorRef.current.send({ image: offCanvas });
          } catch {
            // silently ignore frame errors
          }
        }, 15_000);
      } catch (e) {
        console.warn("MediaPipe face detection unavailable:", e);
      }
    };

    initFaceDetection();

    return () => {
      cancelled = true;
      if (faceIntervalRef.current) {
        clearInterval(faceIntervalRef.current);
        faceIntervalRef.current = null;
      }
      // Release MediaPipe — holds ~200-400 MB WASM + model weights.
      // Skipping this is the primary cause of the STATUS_BREAKPOINT OOM crash.
      if (faceDetectorRef.current) {
        try { faceDetectorRef.current.close(); } catch {}
        faceDetectorRef.current = null;
      }
      // Release the hidden video element and its stream reference.
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch {}
        try { videoRef.current.srcObject = null; } catch {}
        videoRef.current = null;
      }
    };
  }, [isActive, webcamStream, faceMatchEnabled, reportViolation]);

  const resetViolations = useCallback(() => {
    setViolationCount(0);
    setLastViolation(null);
    setShouldTerminate(false);
  }, []);

  return { violationCount, lastViolation, shouldTerminate, resetViolations, disable, lastFaceCountRef, reportViolation };
}
