"use client";

import { useEffect, useRef } from "react";
import { apiUpload, ApiError } from "@/lib/api";
import {
  listPendingRecordings,
  assembleBlob,
  deleteRecording,
  updateMeta,
  pruneStaleOrphans,
  type RecordingMeta,
} from "@/lib/recordingStorage";

/**
 * Scans IndexedDB on mount for any interview recordings that finished the
 * candidate-side session but never confirmed a server-side save (tab closed,
 * network failed, browser crashed, etc.). For each one, re-assembles the
 * chunks and re-attempts upload silently in the background.
 *
 * Safe to mount multiple times — a module-level lock prevents parallel runs.
 * Recordings without a sessionId (never linked to an interview) are pruned
 * after 14 days by `pruneStaleOrphans`.
 */

let recoveryInFlight = false;

async function attemptUpload(meta: RecordingMeta): Promise<boolean> {
  if (meta.sessionId == null) return false;
  const blob = await assembleBlob(meta.recordingId);
  if (!blob || blob.size === 0) {
    console.warn(
      `[orphanRecovery] Empty or missing blob for recording ${meta.recordingId} — deleting.`,
    );
    await deleteRecording(meta.recordingId);
    return false;
  }
  try {
    const form = new FormData();
    form.append("file", blob, `interview_${meta.sessionId}.webm`);
    form.append("duration", meta.duration || "0:00");
    form.append("recording_id", meta.recordingId);
    form.append("recovery", "true");
    await apiUpload(`/interview/sessions/${meta.sessionId}/upload-recording`, form, {
      timeout: 3600_000,
    });
    await updateMeta(meta.recordingId, { uploaded: true });
    await deleteRecording(meta.recordingId);
    console.log(
      `[orphanRecovery] Recovered recording for session ${meta.sessionId} (${(blob.size / (1024 * 1024)).toFixed(1)} MB)`,
    );
    return true;
  } catch (err) {
    const msg =
      err instanceof ApiError ? `HTTP ${err.status}: ${err.detail}` : (err as Error)?.message;
    console.warn(
      `[orphanRecovery] Upload failed for session ${meta.sessionId}: ${msg}. Will retry on next load.`,
    );
    return false;
  }
}

export function useOrphanRecordingRecovery(): void {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    // Defer to an idle moment so we don't compete with the live interview flow
    // for network / cpu during the critical first seconds of a candidate session.
    const run = async () => {
      if (recoveryInFlight) return;
      recoveryInFlight = true;
      try {
        await pruneStaleOrphans();
        const pending = await listPendingRecordings();
        if (pending.length === 0) return;
        console.log(
          `[orphanRecovery] Found ${pending.length} pending recording(s) in IndexedDB — attempting recovery.`,
        );
        for (const meta of pending) {
          if (meta.sessionId == null) continue;
          // eslint-disable-next-line no-await-in-loop
          await attemptUpload(meta);
        }
      } finally {
        recoveryInFlight = false;
      }
    };

    const schedule = () => {
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      };
      if (typeof w.requestIdleCallback === "function") {
        w.requestIdleCallback(() => void run(), { timeout: 10_000 });
      } else {
        setTimeout(() => void run(), 5000);
      }
    };

    schedule();
  }, []);
}
