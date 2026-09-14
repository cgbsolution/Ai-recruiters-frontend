"use client";
import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDown, TrendingUp } from "lucide-react";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { api } from "@/lib/api";

// ── Feature definitions ─────────────────────────────────────────────────────
const FEATURES = [
  { key: "interview", label: "Interview", color: "#8979FF" },
  { key: "jd_generation", label: "JD Gen", color: "#FF6B6B" },
  { key: "jd_parsing", label: "JD Parse", color: "#FFA94D" },
  { key: "resume_parsing", label: "Resume", color: "#51CF66" },
  { key: "fit_score", label: "Fit Score", color: "#339AF0" },
  { key: "question_generation", label: "Q Gen", color: "#CC5DE8" },
  { key: "answer_evaluation", label: "Eval", color: "#20C997" },
  { key: "question_suggestion", label: "Suggest", color: "#F783AC" },
] as const;

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

type ViewMode = "daily" | "weekly" | "monthly";

// ── Types ───────────────────────────────────────────────────────────────────
interface SummaryData {
  totals: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_cost: number;
    call_count: number;
  };
  features: {
    feature: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_cost: number;
    call_count: number;
  }[];
  trends: {
    input_tokens: number;
    output_tokens: number;
    estimated_cost: number;
  };
  chart_data: {
    name: string;
    input_tokens: number;
    output_tokens: number;
    estimated_cost: number;
  }[];
}

// ── Number formatting ───────────────────────────────────────────────────────
function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toLocaleString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pivotCostTimeSeries(raw: any[], mode: ViewMode): Record<string, string | number>[] {
  const map = new Map<string, Record<string, number>>();

  if (mode === "monthly") {
    // Daily breakdown within the current month
    // Pre-fill all days of the current month
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      map.set(String(d), {});
    }
    for (const row of raw) {
      const label = String(row.day ?? 1);
      if (!map.has(label)) map.set(label, {});
      const entry = map.get(label)!;
      entry[row.feature] = (entry[row.feature] || 0) + row.estimated_cost;
    }
  } else if (mode === "weekly") {
    // Mon-Fri of current week
    for (const day of DAY_NAMES) map.set(day, {});
    for (const row of raw) {
      const label = row.day_label || DAY_NAMES[row.day_of_week ?? 0];
      if (!map.has(label)) map.set(label, {});
      const entry = map.get(label)!;
      entry[row.feature] = (entry[row.feature] || 0) + row.estimated_cost;
    }
  } else {
    // Hourly breakdown for today (0-23)
    for (let h = 0; h < 24; h++) {
      map.set(`${h.toString().padStart(2, "0")}:00`, {});
    }
    for (const row of raw) {
      const h = row.hour ?? 0;
      const label = `${h.toString().padStart(2, "0")}:00`;
      if (!map.has(label)) map.set(label, {});
      const entry = map.get(label)!;
      entry[row.feature] = (entry[row.feature] || 0) + row.estimated_cost;
    }
  }

  return Array.from(map.entries()).map(([label, featureCosts]) => {
    const row: { label: string; [key: string]: string | number } = { label };
    for (const f of FEATURES) {
      row[f.key] = featureCosts[f.key] || 0;
    }
    row._total = Object.values(featureCosts).reduce((s, v) => s + v, 0);
    return row;
  });
}

const barChartConfig: ChartConfig = Object.fromEntries(
  FEATURES.map((f) => [f.key, { label: f.label, color: f.color }])
);

export default function AiUsageAnalytics({ orgId }: { orgId?: string } = {}) {
  const [mode, setMode] = useState<ViewMode>("monthly");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [barData, setBarData] = useState<Record<string, string | number>[]>([]);
  const [loading, setLoading] = useState(true);

  // orgId is an org ref. Only the global dashboard (no orgId at all) is unfiltered —
  // never silently drop the filter for an org page.
  const orgParam = orgId !== undefined ? `&org_id=${encodeURIComponent(orgId)}` : "";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const costEndpoint =
        mode === "monthly"
          ? `/credits/cost/monthly?_=1${orgParam}`
          : mode === "weekly"
          ? `/credits/cost/weekly?_=1${orgParam}`
          : `/credits/cost/daily?_=1${orgParam}`;

      const [summaryRes, costRes] = await Promise.all([
        api<SummaryData>(`/credits/summary?period=${mode}${orgParam}`),
        api<Record<string, unknown>[]>(costEndpoint),
      ]);

      setSummary(summaryRes);
      setBarData(pivotCostTimeSeries(costRes, mode));
    } catch {
      setSummary(null);
      setBarData([]);
    } finally {
      setLoading(false);
    }
  }, [mode, orgParam]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getButtonClass = (m: ViewMode) =>
    mode === m
      ? "shadow-theme-xs text-gray-900 dark:text-white bg-white dark:bg-gray-800"
      : "text-gray-500 dark:text-gray-400";

  const t = summary?.totals;

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Card key={idx} className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
              <Skeleton className="h-5 w-24 mb-3" />
              <Skeleton className="h-6 w-20 mb-2" />
              <Skeleton className="h-10 w-16" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {([
            {
              label: "Total Tokens In",
              value: fmtNum(t?.input_tokens ?? 0),
              change: summary?.trends?.input_tokens ?? 0,
              chartKey: "input_tokens" as const,
              color: "#4f46e5",
            },
            {
              label: "Total Tokens Out",
              value: fmtNum(t?.output_tokens ?? 0),
              change: summary?.trends?.output_tokens ?? 0,
              chartKey: "output_tokens" as const,
              color: "#4f46e5",
            },
            {
              label: "Total Token Cost",
              value: `$${(t?.estimated_cost ?? 0).toFixed(2)}`,
              change: summary?.trends?.estimated_cost ?? 0,
              chartKey: "estimated_cost" as const,
              color: "#d97706",
            },
          ]).map((card, idx) => {
            const isPositive = card.change >= 0;
            const Icon = isPositive ? TrendingUp : TrendingDown;
            const miniChartConfig: ChartConfig = {
              value: { label: card.label, color: isPositive ? "#4f46e5" : "#ef4444" },
            };
            const miniData = (summary?.chart_data ?? []).map((d) => ({
              name: d.name,
              value: d[card.chartKey],
            }));

            return (
              <Card
                key={idx}
                className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 flex flex-col justify-between dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <h5 className="text-gray-800 dark:text-white/90 text-base font-medium pb-2">
                  {card.label}
                </h5>

                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span
                    className={`flex items-center justify-center w-8 h-8 rounded-full ${
                      isPositive ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${
                        isPositive ? "text-green-500" : "text-red-500"
                      }`}
                    />
                  </span>
                  <span
                    className={`${
                      isPositive ? "text-green-600" : "text-red-600"
                    } font-medium`}
                  >
                    {isPositive ? "+" : ""}
                    {card.change}%
                  </span>
                </div>

                <CardContent className="p-0 mt-3 flex items-end justify-between">
                  <h4 className="text-3xl font-bold text-gray-900 dark:text-white">
                    {card.value}
                  </h4>
                  <div className="w-20 h-10">
                    <ChartContainer config={miniChartConfig} className="h-full w-full">
                      <BarChart
                        data={miniData}
                        margin={{ top: 5, right: 0, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="name" hide />
                        <YAxis hide />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar
                          dataKey="value"
                          fill={miniChartConfig.value.color}
                          radius={[4, 4, 0, 0]}
                          barSize={6}
                          maxBarSize={10}
                        />
                      </BarChart>
                    </ChartContainer>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Cost Breakdown Bar Chart ───────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
        {/* Header + Filters */}
        <div className="flex flex-col gap-5 mb-6 sm:flex-row sm:justify-between">
          <div className="w-full">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Cost Breakdown
            </h3>
            <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
              {mode === "monthly"
                ? "Feature-wise daily cost (current month)"
                : mode === "weekly"
                ? "Feature-wise cost this week (Mon–Fri)"
                : "Feature-wise cost today (hourly)"}
            </p>
          </div>
          <div className="flex items-start w-full gap-3 sm:justify-end">
            <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
              {(["daily", "weekly", "monthly"] as ViewMode[]).map((m) => (
                <Button
                  key={m}
                  variant="ghost"
                  size="sm"
                  onClick={() => setMode(m)}
                  className={`px-3 py-2 font-medium rounded-md text-theme-sm hover:text-gray-900 dark:hover:text-white ${getButtonClass(m)}`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="max-w-full overflow-x-auto custom-scrollbar">
          <div className="min-w-[700px] xl:min-w-full h-[350px]">
            {loading ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : (
              <ChartContainer config={barChartConfig} className="h-full w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barData}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={barData.length > 15 ? -45 : 0}
                      textAnchor={barData.length > 15 ? "end" : "middle"}
                      height={barData.length > 15 ? 70 : 30}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: "#6B7280" }}
                      tickFormatter={(v: number) => `$${v.toFixed(v >= 1 ? 0 : 2)}`}
                    />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                    />
                    {FEATURES.map((f) => (
                      <Bar
                        key={f.key}
                        dataKey={f.key}
                        name={f.label}
                        stackId="cost"
                        fill={f.color}
                        radius={[0, 0, 0, 0]}
                      />
                    ))}
                    {/* Round top corners on the last visible bar */}
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </div>
        </div>

        {/* Feature legend */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {FEATURES.map((f) => (
            <div key={f.key} className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: f.color }}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {f.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
