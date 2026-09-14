"use client";

import { useEffect, useRef } from "react";
import { API_BASE } from "@/lib/api";
import { reportClientEvent } from "@/lib/clientTelemetry";
import {
  listPendingRecordings,
  assembleBlob,
  deleteRecording,
  updateMeta,
  markAuthRejected,
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
 * AUTH: upload-recording requires the session's X-Session-Token, so each
 * recording carries the token it was made under (RecordingMeta.sessionToken).
 * Older recordings without one are tried without it; a 401/403 keeps the
 * chunks but parks the recording until a token for its session is attached.
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

// 1 hour — recordings can be very large (same budget the old apiUpload call had).
const UPLOAD_TIMEOUT_MS = 3600_000;

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
    // upload-recording requires the session token. Send the one stored WITH
    // this recording — not via api(), which would attach the current tab's
    // token, and that belongs to whatever session this tab is on now.
    // Recordings stored before tokens were persisted have none: try without.
    const triedToken = meta.sessionToken || null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/interview/sessions/${meta.sessionId}/upload-recording`, {
        method: "POST",
        headers: triedToken ? { "X-Session-Token": triedToken } : {},
        body: form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403 || res.status === 409) {
      // 401/403: the same credentials can never succeed. 409: the interview
      // ended long ago AND the server already holds a recording for it, so this
      // copy will never be accepted either. Either way, stop retrying on every
      // load (and don't let this recording hog the per-load batch). Keep the
      // chunks: recovery resumes if a token for this session is attached later
      // (InterviewFlow does that when the candidate rejoins the session).
      await markAuthRejected(meta.recordingId, triedToken);
      reportClientEvent({
        type: "recording_upload_failed",
        message:
          `orphan recovery refused for session ${meta.sessionId} (HTTP ${res.status}` +
          `${triedToken ? "" : ", no stored session token"}) — kept in IndexedDB`,
        context: {
          sessionId: meta.sessionId,
          recordingId: meta.recordingId,
          status: res.status,
          recovery: true,
          hadSessionToken: !!triedToken,
          sizeMb: +(blob.size / (1024 * 1024)).toFixed(1),
        },
      });
      return false;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await updateMeta(meta.recordingId, { uploaded: true });
    await deleteRecording(meta.recordingId);
    console.log(
      `[orphanRecovery] Recovered recording for session ${meta.sessionId} (${(blob.size / (1024 * 1024)).toFixed(1)} MB)`,
    );
    return true;
  } catch (err) {
    const msg =
      (err as Error)?.name === "AbortError" ? "Upload timed out" : (err as Error)?.message;
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
          // Refused for auth (401/403): kept, but can't succeed until a new
          // session token is attached — skip instead of retrying every load.
          .filter((m) => !m.authRejectedAt)
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
