"use client";

import { useCallback, useEffect, useRef } from "react";
import { API_BASE } from "@/lib/api";
import { getChunksFrom } from "@/lib/recordingStorage";

/**
 * Streams the interview recording to the server WHILE the interview is running,
 * instead of uploading one big file at the end.
 *
 * Why: the end-of-interview single-shot upload is lost entirely if the candidate
 * closes the tab/browser/laptop before it finishes. By draining the durable
 * IndexedDB chunk store to the server every few seconds during the interview,
 * the video is already (almost entirely) on the server by the time the interview
 * ends — so closing anything afterwards can no longer lose it. The server stitches
 * the uploaded parts into the final .webm on `finalize()` (and via a server-side
 * safety net if the client never gets to call finalize).
 *
 * Each drain uploads the contiguous run of not-yet-acked chunks as ONE "part"
 * keyed by its start index, so the server can concatenate parts in order. Parts
 * are idempotent (re-uploading a range overwrites the same file).
 */

interface Options {
  recordingId: string | null;
  sessionId: number | null;
  /** True while recording is in progress — drives the periodic drain. */
  active: boolean;
  /** Drain cadence in ms. Default 4000. */
  intervalMs?: number;
}

const PART_TIMEOUT_MS = 30_000;

export function useLiveRecordingUpload({
  recordingId,
  sessionId,
  active,
  intervalMs = 4000,
}: Options) {
  const lastAckedRef = useRef(0);
  const inFlightRef = useRef(false);
  const ridRef = useRef(recordingId);
  const sidRef = useRef(sessionId);
  ridRef.current = recordingId;
  sidRef.current = sessionId;

  // A fresh recording (e.g. on resume) restarts the part sequence at 0.
  const seenRidRef = useRef<string | null>(null);
  if (recordingId && recordingId !== seenRidRef.current) {
    seenRidRef.current = recordingId;
    lastAckedRef.current = 0;
  }

  const drainOnce = useCallback(async (useKeepalive = false): Promise<void> => {
    const rid = ridRef.current;
    const sid = sidRef.current;
    if (!rid || !sid) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const start = lastAckedRef.current;
      const rows = await getChunksFrom(rid, start);
      if (rows.length === 0) return;

      // Take only the CONTIGUOUS run starting at `start` so a missing chunk
      // never produces an out-of-order/garbled part. (MediaRecorder writes
      // sequential indices, so this is normally just "all of them".)
      const blobs: Blob[] = [];
      let expected = start;
      for (const r of rows) {
        if (r.index !== expected) break;
        blobs.push(r.blob);
        expected += 1;
      }
      if (blobs.length === 0) return;

      const part = new Blob(blobs, { type: "video/webm" });
      const form = new FormData();
      form.append("file", part, `part_${sid}_${start}.webm`);
      form.append("start_index", String(start));
      form.append("recording_id", rid);
      const url = `${API_BASE}/interview/sessions/${sid}/recording-part`;

      if (useKeepalive) {
        // Tab is being hidden/closed — fire best-effort. We CANNOT confirm
        // receipt here (a 5xx/429 still resolves the promise), so we must NOT
        // advance the cursor: doing so would skip these chunks forever if the
        // server didn't actually store them. Parts are idempotent (keyed by
        // start_index), so the next normal drain / finalize tail-sweep / orphan
        // recovery harmlessly re-sends this same range and confirms it.
        void fetch(url, { method: "POST", body: form, keepalive: true }).catch(() => {});
        return;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PART_TIMEOUT_MS);
      try {
        const res = await fetch(url, { method: "POST", body: form, signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Only advance the cursor once the server has the bytes — a failure
        // leaves lastAcked unchanged so the next tick retries the same run.
        lastAckedRef.current = expected;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Swallow — retried on the next tick / by finalize / by orphan recovery.
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // Periodic drain while recording.
  useEffect(() => {
    if (!active || !recordingId || !sessionId) return;
    const id = window.setInterval(() => void drainOnce(false), intervalMs);
    return () => window.clearInterval(id);
  }, [active, recordingId, sessionId, intervalMs, drainOnce]);

  // Best-effort flush the moment the tab is hidden or being torn down.
  useEffect(() => {
    if (!active) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") void drainOnce(true);
    };
    const onPageHide = () => void drainOnce(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [active, drainOnce]);

  /**
   * Drain whatever remains, then ask the server to stitch the parts into the
   * final video. Returns true if the server confirmed the finalize.
   */
  const finalize = useCallback(async (duration: string): Promise<boolean> => {
    const rid = ridRef.current;
    const sid = sidRef.current;
    if (!rid || !sid) return false;

    // A few passes to sweep up the tail of chunks written right before stop.
    let remainingCount = 0;
    for (let i = 0; i < 6; i += 1) {
      await drainOnce(false);
      remainingCount = (await getChunksFrom(rid, lastAckedRef.current)).length;
      if (remainingCount === 0) break;
    }

    // If chunks STILL remain past the cursor, the live parts are incomplete —
    // either the server kept failing or a missing chunk stranded the tail at a
    // gap. Report failure so the caller falls back to the single-shot upload
    // (which sends the whole assembled blob and keeps the local copy intact).
    // Never let a partial set masquerade as a complete recording.
    if (remainingCount > 0) return false;

    try {
      const form = new FormData();
      form.append("recording_id", rid);
      form.append("duration", duration);
      const res = await fetch(
        `${API_BASE}/interview/sessions/${sid}/recording-finalize`,
        { method: "POST", body: form },
      );
      return res.ok;
    } catch {
      return false;
    }
  }, [drainOnce]);

  return { finalize, drainOnce };
}
