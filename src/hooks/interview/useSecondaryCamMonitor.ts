import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

interface SecondaryCamState {
  isConnected: boolean;
  isDisconnected: boolean;
  status: string;
  secondsSinceHeartbeat: number | null;
}

/**
 * Monitors the secondary camera connection during the interview.
 * Polls the backend every 10 seconds to check heartbeat freshness.
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
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/secondary-cam/${sessionId}/status`);
      if (!res.ok) return;
      const data = await res.json();

      setState({
        isConnected: data.status === "active" || data.status === "verified",
        isDisconnected: data.status === "disconnected" || data.heartbeat_stale,
        status: data.status,
        secondsSinceHeartbeat: data.seconds_since_heartbeat,
      });
    } catch {
      // Network error — don't change state, will retry
    }
  }, [sessionId]);

  useEffect(() => {
    if (!enabled) return;

    // Initial check
    poll();

    // Poll every 10 seconds
    pollRef.current = setInterval(poll, 10000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [enabled, poll]);

  return state;
}
