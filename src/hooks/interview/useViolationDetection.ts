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
  /** Report a violation explicitly (e.g. screen-share stopped, detected by the room). */
  reportViolation: (type: ViolationType, details?: string) => Promise<void>;
}

const TERMINATE_THRESHOLD = 5;

/**
 * Behavioural proctoring for the interview room: tab-switch, fullscreen-exit,
 * and explicitly-reported violations (e.g. screen-share stopped).
 *
 * Face detection used to run here via MediaPipe (~300 MB of WASM + model loaded
 * INTO the candidate's browser tab). That was the single biggest driver of the
 * "Aw, Snap! STATUS_BREAKPOINT" out-of-memory crash, so it has been removed.
 * Face counting is now done SERVER-SIDE from the periodic webcam screenshots the
 * candidate already uploads (see the backend `/screenshot` endpoint), which the
 * proctoring report surfaces — no heavy model in the candidate's tab.
 */
export function useViolationDetection(
  sessionId: number | null,
  isActive: boolean,
): ViolationDetectionHook {
  const [violationCount, setViolationCount] = useState(0);
  const [lastViolation, setLastViolation] = useState<ViolationType | null>(null);
  const [shouldTerminate, setShouldTerminate] = useState(false);
  const disabledRef = useRef(false);

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

  const resetViolations = useCallback(() => {
    setViolationCount(0);
    setLastViolation(null);
    setShouldTerminate(false);
  }, []);

  return { violationCount, lastViolation, shouldTerminate, resetViolations, disable, reportViolation };
}
