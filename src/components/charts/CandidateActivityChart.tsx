"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface FunnelRow {
  label: string;
  applied?: number;
  interview?: number;
  offered?: number;
  selected?: number;
  hired?: number;
  rejected?: number;
}

const chartConfig: ChartConfig = {
  total: { label: "Candidates", color: "#6366f1" },
};

export default function CandidateActivityChart() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FunnelRow[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<FunnelRow[]>("/jobs/hiring-funnel?period=monthly", {
        timeout: 10_000,
      });
      setRows(res);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Aggregate per-month totals
  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        label: r.label,
        total:
          (r.applied ?? 0) +
          (r.interview ?? 0) +
          (r.offered ?? 0) +
          (r.selected ?? 0) +
          (r.hired ?? 0) +
          (r.rejected ?? 0),
      })),
    [rows],
  );

  // Current year month-range label
  const rangeLabel = useMemo(() => {
    if (chartData.length === 0) return "";
    const first = chartData[0].label;
    const last = chartData[chartData.length - 1].label;
    return `${first} – ${last} ${new Date().getFullYear()}`;
  }, [chartData]);

  // Trend: current month vs previous month
  const trend = useMemo(() => {
    if (chartData.length < 2) return null;
    const current = chartData[chartData.length - 1].total;
    const previous = chartData[chartData.length - 2].total;
    if (previous === 0) {
      if (current === 0) return { delta: 0, direction: "flat" as const };
      return { delta: 100, direction: "up" as const };
    }
    const delta = ((current - previous) / previous) * 100;
    const direction = delta > 0.5 ? ("up" as const) : delta < -0.5 ? ("down" as const) : ("flat" as const);
    return { delta: Math.abs(delta), direction };
  }, [chartData]);

  const total = chartData.reduce((acc, r) => acc + r.total, 0);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-gray-900/40">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 to-white px-5 py-4 dark:border-white/10 dark:from-indigo-500/5 dark:to-transparent">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Candidate Activity
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Total applicants received by month
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
            {total.toLocaleString()}
          </p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            total this year
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="p-5">
        <div className="h-[260px] w-full">
          {loading ? (
            <Skeleton className="h-full w-full rounded-xl" />
          ) : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              No candidate data to display
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="candidateActivityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                      <stop offset="55%" stopColor="#8b5cf6" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    width={32}
                  />
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Candidates"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#candidateActivityFill)"
                    isAnimationActive
                    animationDuration={800}
                    animationEasing="ease-out"
                    dot={{ r: 2.5, fill: "#6366f1" }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-3 text-xs dark:border-white/10">
        <div className="flex items-center gap-2">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                trend.direction === "up"
                  ? "bg-emerald-50 text-emerald-600 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
                  : trend.direction === "down"
                  ? "bg-rose-50 text-rose-600 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30"
                  : "bg-gray-50 text-gray-600 ring-gray-200 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10",
              )}
            >
              {trend.direction === "up" ? (
                <TrendingUp className="h-3 w-3" />
              ) : trend.direction === "down" ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              {trend.direction === "flat"
                ? "No change"
                : `${trend.direction === "up" ? "+" : "−"}${trend.delta.toFixed(1)}%`}
            </span>
          )}
          <span className="text-gray-500 dark:text-gray-400">
            {trend?.direction === "up"
              ? "Trending up this month"
              : trend?.direction === "down"
              ? "Slower this month"
              : "Stable this month"}
          </span>
        </div>
        <span className="text-gray-500 dark:text-gray-400">{rangeLabel}</span>
      </div>
    </div>
  );
}
