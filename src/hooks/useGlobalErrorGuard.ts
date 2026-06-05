"use client";

import { useEffect } from "react";
import { reportClientEvent } from "@/lib/clientTelemetry";

/**
 * Installs process-wide guards for the errors a React ErrorBoundary CANNOT see.
 *
 * ErrorBoundaries only catch synchronous errors thrown during React rendering.
 * The interview page's real risk surface is asynchronous: MediaRecorder
 * callbacks, WebSocket handlers, setInterval ticks, and unawaited promises.
 * An error there bypasses React entirely — it would otherwise vanish into the
 * console (best case) or wedge a subsystem (worst case).
 *
 * This hook:
 *   - reports `error` and `unhandledrejection` events as telemetry, and
 *   - flags an `abnormal_unload` if the page is torn down mid-interview, which
 *     (combined with the durable IndexedDB recording) is the fingerprint of a
 *     tab crash vs. a clean exit.
 *
 * It is intentionally NON-disruptive: it never shows UI or reloads on its own.
 * Recoverable async errors should stay invisible to the candidate; only a hard
 * React render failure (handled by ErrorBoundary) surfaces a recovery screen.
 */
export function useGlobalErrorGuard(opts: { duringInterview?: boolean } = {}): void {
  const { duringInterview = false } = opts;

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      reportClientEvent({
        type: "js_error",
        message: e.message,
        context: {
          source: e.filename,
          line: e.lineno,
          col: e.colno,
          stack: e.error?.stack?.slice(0, 2000),
        },
      });
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      reportClientEvent({
        type: "unhandled_rejection",
        message:
          reason instanceof Error ? reason.message : String(reason ?? "unknown rejection"),
        context: { stack: reason instanceof Error ? reason.stack?.slice(0, 2000) : undefined },
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Separately track abnormal teardown during the live interview. `pagehide`
  // fires for tab close, navigation, AND when the renderer is being reclaimed,
  // so a beacon here is our best shot at recording a crash before it completes.
  useEffect(() => {
    if (!duringInterview) return;
    const onPageHide = (e: PageTransitionEvent) => {
      reportClientEvent({
        type: "abnormal_unload",
        message: e.persisted ? "bfcache" : "pagehide during interview",
        context: { persisted: e.persisted },
      });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [duringInterview]);
}
