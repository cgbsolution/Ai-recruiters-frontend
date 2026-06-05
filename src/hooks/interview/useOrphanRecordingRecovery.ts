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
 *
 * MEMORY SAFETY: `assembleBlob` pulls an entire recording into memory. Doing
 * that for several orphans at once — while the live interview is also running
 * a WebGL avatar, a screen+webcam MediaRecorder, and a frame streamer — can
 * push the tab past Chrome's renderer budget and crash it ("Aw, Snap!" /
 * STATUS_BREAKPOINT). A crash then orphans the *current* recording too, so the
 * next attempt finds even more orphans and crashes sooner — a vicious loop.
 * To prevent this we (a) only run while `enabled` (never during the live
 * interview), (b) process the OLDEST few one at a time, releasing each blob
 * before assembling the next, and (c) abort the moment the interview starts.
 */

let recoveryInFlight = false;

// Recover at most this many per page load so memory never holds more than one
// assembled recording at a time. The rest are picked up on subsequent loads.
const DEFAULT_MAX_PER_LOAD = 2;

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

interface RecoveryOptions {
  /**
   * Only attempt recovery while true. Pass `false` once the candidate has
   * acquired camera/screen or entered the live interview so recovery never
   * competes with — or piles memory on top of — the recording + avatar.
   */
  enabled?: boolean;
  /** Max recordings to recover per page load. Defaults to 2. */
  maxPerLoad?: number;
}

export function useOrphanRecordingRecovery(opts: RecoveryOptions = {}): void {
  const { enabled = true, maxPerLoad = DEFAULT_MAX_PER_LOAD } = opts;
  const ranRef = useRef(false);
  // Read the latest `enabled` from inside the deferred/async run without
  // re-running the effect: lets us abort recovery the instant an interview starts.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    // Defer to an idle moment so we don't compete with the live interview flow
    // for network / cpu during the critical first seconds of a candidate session.
    const run = async () => {
      if (!enabledRef.current) return; // do not run during the live interview
      if (recoveryInFlight) return;
      recoveryInFlight = true;
      try {
        await pruneStaleOrphans();
        const pending = (await listPendingRecordings())
          .filter((m) => m.sessionId != null)
          // Oldest first: drain the backlog deterministically across loads.
          .sort((a, b) => a.createdAt - b.createdAt);
        if (pending.length === 0) return;
        const batch = pending.slice(0, Math.max(1, maxPerLoad));
        console.log(
          `[orphanRecovery] Found ${pending.length} pending recording(s) in IndexedDB — ` +
            `recovering ${batch.length} this load, one at a time (rest resume on later loads).`,
        );
        for (const meta of batch) {
          // Bail the moment the candidate starts the interview — never hold an
          // assembled recording in memory alongside the live recording/avatar.
          if (!enabledRef.current) break;
          await attemptUpload(meta);
          // Yield a beat so the just-assembled blob is released for GC before
          // we pull the next whole recording into memory.
          await new Promise((r) => setTimeout(r, 1500));
        }
      } finally {
        recoveryInFlight = false;
      }
    };

    if (!enabled) return; // never even schedule while disabled

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
    // Intentionally run-once on mount; live `enabled` is read via enabledRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
