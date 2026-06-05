"use client";

import { useEffect, useRef, useState } from "react";
import { reportClientEvent } from "@/lib/clientTelemetry";

/**
 * Watches the renderer's JS heap and turns rising memory into an actionable
 * signal BEFORE Chrome force-kills the tab ("Aw, Snap!" / STATUS_BREAKPOINT).
 *
 * The crash is uncatchable once it happens — the JS process is dead — so the
 * only real defense is to notice the approach and shed load early. Subsystems
 * (frame streamer, recording quality, avatar) subscribe to `pressure` and
 * voluntarily degrade when it rises, trading fidelity for survival.
 *
 * `performance.memory` is Chromium-only and non-standard, but the interview is
 * desktop-Chrome-only anyway, which is exactly where this crash occurs. On
 * browsers without it, the watchdog reports "normal" forever (a no-op), so it
 * is always safe to mount.
 */

export type MemoryPressure = "normal" | "elevated" | "critical";

interface PerfMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface Options {
  /** Poll interval in ms. Default 4000. */
  intervalMs?: number;
  /** used/limit ratio at which to flag "elevated". Default 0.70. */
  elevatedRatio?: number;
  /** used/limit ratio at which to flag "critical". Default 0.85. */
  criticalRatio?: number;
  /** Pass a steady clock value if you want determinism; defaults to Date.now. */
}

export interface MemoryWatchdogState {
  pressure: MemoryPressure;
  /** 0..1 heap usage, or null when unmeasurable. */
  ratio: number | null;
  /** True once pressure has reached elevated/critical — subsystems should degrade. */
  shouldDegrade: boolean;
}

function readMemory(): PerfMemory | null {
  const mem = (performance as Performance & { memory?: PerfMemory }).memory;
  if (!mem || typeof mem.usedJSHeapSize !== "number" || !mem.jsHeapSizeLimit) return null;
  return mem;
}

export function useMemoryWatchdog(opts: Options = {}): MemoryWatchdogState {
  const { intervalMs = 4000, elevatedRatio = 0.7, criticalRatio = 0.85 } = opts;

  const [pressure, setPressure] = useState<MemoryPressure>("normal");
  const [ratio, setRatio] = useState<number | null>(null);
  // Latch the worst level reached for a few cycles so we don't oscillate
  // (degrade → memory drops → re-enable → spike → degrade ...).
  const lastReportedRef = useRef<MemoryPressure>("normal");

  useEffect(() => {
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const mem = readMemory();
      if (!mem) return; // unmeasurable: stay "normal"
      const r = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
      const next: MemoryPressure =
        r >= criticalRatio ? "critical" : r >= elevatedRatio ? "elevated" : "normal";

      setRatio(r);
      setPressure((prev) => (prev === next ? prev : next));

      // Report only on escalation, and only once per level, to avoid spam.
      const rank = { normal: 0, elevated: 1, critical: 2 } as const;
      if (rank[next] > rank[lastReportedRef.current]) {
        reportClientEvent({
          type: "memory_pressure",
          message: `heap ${(r * 100).toFixed(0)}% → ${next}`,
          context: {
            usedMb: Math.round(mem.usedJSHeapSize / 1048576),
            limitMb: Math.round(mem.jsHeapSizeLimit / 1048576),
            level: next,
          },
        });
      }
      lastReportedRef.current = next;
    };

    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs, elevatedRatio, criticalRatio]);

  return {
    pressure,
    ratio,
    shouldDegrade: pressure !== "normal",
  };
}
