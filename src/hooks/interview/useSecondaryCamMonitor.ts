import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, sessionTokenHeader } from "@/lib/api";

interface SecondaryCamState {
  isConnected: boolean;
  isDisconnected: boolean;
  status: string;
  secondsSinceHeartbeat: number | null;
  /** How many seconds the device has been disconnected (0 if connected) */
  disconnectedSeconds: number;
}

const POLL_INTERVAL_MS = 5000; // Check every 5s

/**
 * Monitors the secondary camera connection during the interview.
 * Tracks how long the device has been disconnected for countdown UI.
 */
export function useSecondaryCamMonitor(
  sessionId: number,
  enabled: boolean
): SecondaryCamState {
  const [state, setState] = useState<SecondaryCamState>({
    isConnected: false,
    isDisconnected: false,
    status: "pending",
    secondsSinceHeartbeat: null,
    disconnectedSeconds: 0,
  });

  const disconnectedAtRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/secondary-cam/${sessionId}/status`, {
        headers: sessionTokenHeader(),
      });
      if (!res.ok) return;
      const data = await res.json();

      const connected = data.status === "active" || data.status === "verified";
      const disconnected = data.status === "disconnected" || data.heartbeat_stale;

      if (disconnected && !disconnectedAtRef.current) {
        // Just became disconnected — start tracking
        disconnectedAtRef.current = Date.now();
      } else if (connected) {
        // Reconnected — reset
        disconnectedAtRef.current = null;
      }

      const disconnectedSeconds = disconnectedAtRef.current
        ? Math.floor((Date.now() - disconnectedAtRef.current) / 1000)
        : 0;

      setState({
        isConnected: connected,
        isDisconnected: disconnected,
        status: data.status,
        secondsSinceHeartbeat: data.seconds_since_heartbeat,
        disconnectedSeconds,
      });
    } catch {
      // Network error — don't change state
    }
  }, [sessionId]);

  // Main polling loop
  useEffect(() => {
    if (!enabled) return;

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [enabled, poll]);

  // Update disconnected seconds every second for smooth countdown
  useEffect(() => {
    if (!state.isDisconnected) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }

    countdownRef.current = setInterval(() => {
      if (disconnectedAtRef.current) {
        setState((prev) => ({
          ...prev,
          disconnectedSeconds: Math.floor((Date.now() - disconnectedAtRef.current!) / 1000),
        }));
      }
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [state.isDisconnected]);

  return state;
}
