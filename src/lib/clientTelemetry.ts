/**
 * Best-effort client telemetry — so you find out a candidate's tab is in
 * trouble WITHOUT waiting for them to complain.
 *
 * A renderer crash ("Aw, Snap!" / STATUS_BREAKPOINT) kills the JS process, so
 * nothing can run *after* it. The strategy instead is to report the *warning
 * signs* (rising memory, caught JS errors, abnormal unloads) while the page is
 * still alive, using `navigator.sendBeacon` which is delivered even as the tab
 * is being torn down.
 *
 * Transport is fire-and-forget and fully optional: if the backend has no
 * `/client-events` sink yet, the beacon simply 404s and is ignored. Adding the
 * endpoint later turns this on with zero frontend changes.
 */

import { API_BASE } from "@/lib/api";

export type ClientEventType =
  | "js_error" // uncaught synchronous error
  | "unhandled_rejection" // uncaught promise rejection
  | "react_error" // caught by an ErrorBoundary
  | "memory_pressure" // watchdog crossed a threshold
  | "load_shed" // a subsystem was degraded to save the tab
  | "abnormal_unload" // page hidden/closed during the live interview
  | "session_recovered" // a prior session ended abnormally; this load resumed it
  // ── Recording lifecycle (so "video not present" is never silent) ──
  | "recording_upload_started" // upload of a finished recording began
  | "recording_upload_succeeded" // server confirmed the recording was saved
  | "recording_upload_failed" // all upload retries failed (kept in IndexedDB)
  | "recording_upload_attempt_failed" // one attempt failed; will retry
  | "recording_empty" // the recorder produced a 0-byte blob
  | "recording_missing"; // interview ended with no recording blob at all

export interface ClientEvent {
  type: ClientEventType;
  message?: string;
  context?: Record<string, unknown>;
  /** Caller-supplied timestamp (ms). Optional; server can stamp on receipt. */
  at?: number;
}

// Collapse identical, rapid-fire events (e.g. an error thrown every animation
// frame) so we never become the thing that floods the network or memory.
const recentKeys = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10_000;

function shouldSend(key: string, now: number): boolean {
  const last = recentKeys.get(key);
  if (last != null && now - last < DEDUPE_WINDOW_MS) return false;
  recentKeys.set(key, now);
  // Bound the dedupe map so it can't grow without limit.
  if (recentKeys.size > 200) {
    for (const [k, t] of recentKeys) {
      if (now - t > DEDUPE_WINDOW_MS) recentKeys.delete(k);
    }
  }
  return true;
}

/**
 * Report a client event. Never throws, never blocks, never breaks the UI.
 * Pass `now` from the caller (we avoid Date.now() coupling at module scope).
 */
export function reportClientEvent(evt: ClientEvent): void {
  try {
    if (typeof window === "undefined") return;
    const now = evt.at ?? Date.now();
    const key = `${evt.type}:${(evt.message || "").slice(0, 120)}`;
    if (!shouldSend(key, now)) return;

    // Always leave a local breadcrumb for live debugging.
    console.warn(`[telemetry] ${evt.type}: ${evt.message ?? ""}`, evt.context ?? {});

    const payload = JSON.stringify({
      ...evt,
      at: now,
      url: window.location?.href,
      userAgent: navigator.userAgent,
      deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    });

    const url = `${API_BASE}/client-events`;
    // IMPORTANT: send as text/plain, not application/json. The frontend and
    // backend are different origins (Vercel vs. the API host), so an
    // application/json body would trigger a CORS preflight — which sendBeacon
    // cannot perform, so the beacon would be silently dropped. text/plain is a
    // CORS-safelisted content type (a "simple request"), so it reaches the
    // server with no preflight. The backend reads the raw body and JSON-parses
    // it regardless of the declared content type.
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "text/plain;charset=UTF-8" });
      navigator.sendBeacon(url, blob);
    } else {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Telemetry must never be load-bearing.
  }
}
