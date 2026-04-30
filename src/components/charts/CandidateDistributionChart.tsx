"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { PieChart as PieIcon, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

type CandidateStatus =
  | "Applied"
  | "Interview"
  | "Offered"
  | "Selected"
  | "Hired"
  | "Rejected";

interface CandidateRow {
  id: number;
  status: CandidateStatus | string;
}

const STAGES: { key: CandidateStatus; label: string; color: string }[] = [
  { key: "Applied", label: "Applied", color: "#f59e0b" },
  { key: "Interview", label: "Interview", color: "#3b82f6" },
  { key: "Offered", label: "Offered", color: "#a855f7" },
  { key: "Selected", label: "Selected", color: "#14b8a6" },
  { key: "Hired", label: "Hired", color: "#10b981" },
  { key: "Rejected", label: "Rejected", color: "#ef4444" },
];

const chartConfig: ChartConfig = Object.fromEntries(
  STAGES.map((s) => [s.key, { label: s.label, color: s.color }]),
);

export default function CandidateDistributionChart() {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<CandidateRow[]>("/candidates/", { timeout: 10_000 });
      setCandidates(res);
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Count by status (exclude zero-count slices so the donut doesn't render invisible wedges)
  const slices = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of candidates) counts[c.status] = (counts[c.status] ?? 0) + 1;
    return STAGES.map((s) => ({
      ...s,
      value: counts[s.key] ?? 0,
    })).filter((s) => s.value > 0);
  }, [candidates]);

  const total = useMemo(() => slices.reduce((a, s) => a + s.value, 0), [slices]);

  // Progress-through-pipeline rate (Hired / total, excluding Rejected)
  const inPipeline = useMemo(
    () => candidates.filter((c) => c.status !== "Rejected").length,
    [candidates],
  );
  const hired = useMemo(
    () => candidates.filter((c) => c.status === "Hired").length,
    [candidates],
  );
  const hireRate = inPipeline > 0 ? (hired / inPipeline) * 100 : 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-gray-900/40">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-purple-50/50 to-white px-5 py-4 dark:border-white/10 dark:from-purple-500/5 dark:to-transparent">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-500 ring-1 ring-purple-100 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-500/20">
            <PieIcon className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Candidate Distribution
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Live breakdown across every pipeline stage
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
            {total.toLocaleString()}
          </p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            candidates
          </p>
        </div>
      </div>

      {/* Body: donut + legend */}
      <div className="grid gap-4 p-5 sm:grid-cols-[240px_1fr]">
        {/* Donut */}
        <div className="relative mx-auto h-[220px] w-[220px] shrink-0">
          {loading ? (
            <Skeleton className="h-full w-full rounded-full" />
          ) : slices.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center rounded-full border border-dashed border-gray-200 text-xs text-gray-400 dark:border-white/10">
              No data
            </div>
          ) : (
            <>
              <ChartContainer config={chartConfig} className="h-full w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      {slices.map((s) => (
                        <linearGradient key={s.key} id={`slice-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={s.color} stopOpacity={1} />
                          <stop offset="100%" stopColor={s.color} stopOpacity={0.75} />
                        </linearGradient>
                      ))}
                    </defs>
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Pie
                      data={slices}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={60}
                      outerRadius={92}
                      paddingAngle={2}
                      cornerRadius={6}
                      strokeWidth={0}
                      isAnimationActive
                      animationDuration={800}
                    >
                      {slices.map((s) => (
                        <Cell key={s.key} fill={`url(#slice-${s.key})`} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
              {/* Center label */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total</span>
                <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                  {total.toLocaleString()}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {slices.length} active {slices.length === 1 ? "stage" : "stages"}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-col justify-center">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {STAGES.map((s) => {
                const count = slices.find((sl) => sl.key === s.key)?.value ?? 0;
                const pct = total > 0 ? (count / total) * 100 : 0;
                const isEmpty = count === 0;
                return (
                  <li
                    key={s.key}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                      isEmpty ? "opacity-50" : "hover:bg-gray-50 dark:hover:bg-white/5",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="truncate text-gray-700 dark:text-gray-200">{s.label}</span>
                    </div>
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
                        {count.toLocaleString()}
                      </span>
                      <span className="w-12 text-right text-xs tabular-nums text-gray-400">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Footer — hire conversion insight */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-3 text-xs dark:border-white/10">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30">
            <Users className="h-3 w-3" />
            {hireRate.toFixed(1)}% hire rate
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            {hired} hired of {inPipeline} in pipeline
          </span>
        </div>
        <span className="text-gray-500 dark:text-gray-400">
          {total.toLocaleString()} total tracked
        </span>
      </div>
    </div>
  );
}
