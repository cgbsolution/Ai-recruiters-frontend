"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, OctagonAlert } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
export const fmtNum = (n: number) => (Math.abs(n) >= 10_000 ? compact.format(n) : n.toLocaleString());

/**
 * Ordered stages of one series (sent → opened → refreshed): one shadcn
 * Progress bar per stage on a shared scale, each labelled with its count and
 * its share of the first stage. Hover shows the exact numbers.
 */
export function FunnelBars({ stages }: { stages: { label: string; value: number; hint?: string }[] }) {
  const base = Math.max(stages[0]?.value ?? 0, 1);
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className="space-y-2.5" role="table" aria-label="Funnel">
      {stages.map((s) => {
        const share = s.value / base;
        const width = Math.max((s.value / max) * 100, s.value > 0 ? 1.5 : 0);
        const tip = `${s.label}: ${s.value.toLocaleString()} (${(share * 100).toFixed(1)}% of ${stages[0].label.toLowerCase()})`;
        return (
          <div
            key={s.label}
            role="row"
            title={tip}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[7.5rem_1fr_6.5rem]"
          >
            <div role="rowheader" className="truncate text-sm text-muted-foreground">
              {s.label}
            </div>
            <Progress
              value={width}
              aria-label={s.label}
              className="order-last col-span-2 h-6 rounded-[4px] sm:order-none sm:col-span-1 [&>[data-slot=progress-indicator]]:bg-brand-500"
            />
            <div role="cell" className="text-right text-sm tabular-nums text-gray-900 dark:text-gray-100">
              {fmtNum(s.value)}
              <span className="ml-1.5 text-xs text-muted-foreground">{(share * 100).toFixed(0)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A single ratio against a limit, as a shadcn Progress bar (amber near the limit). */
export function Meter({ value, max, label, sub }: { value: number; max: number; label: string; sub?: string }) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const severe = ratio >= 0.95;
  return (
    <div title={`${label}: ${value.toLocaleString()} of ${max.toLocaleString()}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-gray-900 dark:text-gray-100">
          {value.toLocaleString()} <span className="text-muted-foreground">/ {max.toLocaleString()}</span>
        </span>
      </div>
      <Progress
        value={ratio * 100}
        aria-label={label}
        className={cn(
          "h-2.5",
          severe
            ? "bg-amber-100 dark:bg-amber-500/15 [&>[data-slot=progress-indicator]]:bg-amber-500"
            : "[&>[data-slot=progress-indicator]]:bg-brand-500",
        )}
      />
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** good / warning / critical — always an icon and words, never colour alone. */
export function StatusLine({ level, children }: { level: "good" | "warning" | "critical"; children: React.ReactNode }) {
  const Icon = level === "good" ? CheckCircle2 : level === "warning" ? AlertTriangle : OctagonAlert;
  return (
    <div className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          level === "good" && "text-[#0ca30c]",
          level === "warning" && "text-[#d98e00]",
          level === "critical" && "text-[#d03b3b]",
        )}
      />
      <span>
        <span className="sr-only">{level}: </span>
        {children}
      </span>
    </div>
  );
}
