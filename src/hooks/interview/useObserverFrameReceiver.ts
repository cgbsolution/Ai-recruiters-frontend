"use client";

/**
 * Observer-side: receives candidate JPEG frames over WebSocket and exposes
 * the most recent frame as an Object URL the page can render in an <img>.
 *
 * The companion to useFrameStreamer on the candidate side.
 */

import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

export type FrameConnectionState = "idle" | "connecting" | "open" | "closed" | "no_session";

interface Result {
  frameUrl: string | null;
  state: FrameConnectionState;
  /** Number of frames received since the WS opened — useful for diagnostics. */
  frameCount: number;
}

function buildWsUrl(token: string): string {
  const base = (API_BASE || "").replace(/\/$/, "");
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/observe/${encodeURIComponent(token)}/frames`;
}

export function useObserverFrameReceiver(token: string | null, enabled: boolean): Result {
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [state, setState] = useState<FrameConnectionState>("idle");
  const [frameCount, setFrameCount] = useState(0);

  // Hold the previous URL so we can revoke it once the new one is in.
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token || !enabled) {
      setState("idle");
      return;
    }

    let aborted = false;
    let ws: WebSocket | null = null;
    let reconnectAttempt = 0;
    let reconnectTimer: number | null = null;

    const cleanup = () => {
      try { ws?.close(); } catch {}
      ws = null;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      if (aborted) return;
      setState("connecting");
      try {
        ws = new WebSocket(buildWsUrl(token));
      } catch {
        scheduleReconnect();
        return;
      }
      ws.binaryType = "blob";
      ws.onopen = () => {
        reconnectAttempt = 0;
        if (!aborted) setState("open");
      };
      ws.onmessage = (ev) => {
        if (aborted) return;
        if (typeof ev.data === "string") {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === "no_session") setState("no_session");
          } catch {}
          return;
        }
        // Binary frame — wrap in Object URL and swap.
        const blob = ev.data instanceof Blob ? ev.data : new Blob([ev.data]);
        const url = URL.createObjectURL(blob);
        const old = prevUrlRef.current;
        prevUrlRef.current = url;
        setFrameUrl(url);
        setFrameCount((c) => c + 1);
        // Revoke after the next paint so the <img> finishes swapping first.
        if (old) {
          window.setTimeout(() => URL.revokeObjectURL(old), 100);
        }
      };
      ws.onclose = () => {
        ws = null;
        if (!aborted) {
          setState("closed");
          scheduleReconnect();
        }
      };
      ws.onerror = () => {
        // onclose handles reconnection.
      };
    };

    const scheduleReconnect = () => {
      if (aborted) return;
      reconnectAttempt++;
      const delay = Math.min(15000, 1000 * Math.pow(2, reconnectAttempt));
      reconnectTimer = window.setTimeout(() => {
        if (!aborted) connect();
      }, delay);
    };

    connect();

    return () => {
      aborted = true;
      cleanup();
      // Revoke the most recent URL on unmount.
      const last = prevUrlRef.current;
      if (last) URL.revokeObjectURL(last);
      prevUrlRef.current = null;
    };
  }, [token, enabled]);

  return { frameUrl, state, frameCount };
}
