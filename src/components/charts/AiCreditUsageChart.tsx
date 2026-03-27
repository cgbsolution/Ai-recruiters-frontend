"use client";
import React, { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { api } from "@/lib/api";

// ── Feature definitions with distinct colors ────────────────────────────────
const FEATURES = [
  { key: "interview", label: "Interview Room", color: "#8979FF" },
  { key: "jd_generation", label: "JD Generation", color: "#FF6B6B" },
  { key: "jd_parsing", label: "JD Parsing", color: "#FFA94D" },
  { key: "resume_parsing", label: "Resume Parsing", color: "#51CF66" },
  { key: "fit_score", label: "Fit Score", color: "#339AF0" },
  { key: "question_generation", label: "Question Gen", color: "#CC5DE8" },
  { key: "answer_evaluation", label: "Answer Eval", color: "#20C997" },
  { key: "question_suggestion", label: "Question Suggest", color: "#F783AC" },
] as const;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// Build Recharts chart config
const chartConfig: ChartConfig = Object.fromEntries(
  FEATURES.map((f) => [f.key, { label: f.label, color: f.color }])
);

type ViewMode = "monthly" | "weekly" | "daily";

interface ChartRow {
  label: string;
  [feature: string]: string | number;
}

// ── Helper: create an empty row with all features = 0 ─────────────────────
function emptyRow(label: string): ChartRow {
  const entry: ChartRow = { label };
  for (const f of FEATURES) entry[f.key] = 0;
  return entry;
}

// ── Monthly: Jan–Dec, one point per month ─────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pivotMonthly(raw: any[]): ChartRow[] {
  // Pre-fill all 12 months
  const map = new Map<string, ChartRow>();
  for (let i = 0; i < 12; i++) map.set(MONTH_NAMES[i], emptyRow(MONTH_NAMES[i]));

  for (const row of raw) {
    const label = MONTH_NAMES[(row.month ?? 1) - 1];
    const entry = map.get(label)!;
    entry[row.feature] = (entry[row.feature] as number || 0) + row.total_tokens;
  }
  return Array.from(map.values());
}

// ── Weekly: Mon–Sun of current week ───────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pivotWeekly(raw: any[]): ChartRow[] {
  // Build Mon–Sun with actual dates
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // 0=Mon
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek);
  monday.setHours(0, 0, 0, 0);

  const map = new Map<string, ChartRow>();
  for (let i = 0; i < 5; i++) {  // Mon-Fri only
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10); // "2026-03-23"
    const label = DAY_NAMES[i];
    const entry = emptyRow(label);
    (entry as Record<string, string | number>)._date = dateStr;
    map.set(dateStr, entry);
  }

  for (const row of raw) {
    const dateStr = row.date; // "2026-03-27"
    const entry = map.get(dateStr);
    if (entry) {
      entry[row.feature] = (entry[row.feature] as number || 0) + row.total_tokens;
    }
  }
  return Array.from(map.values());
}

// ── Daily: 24 hours of today ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pivotDaily(raw: any[]): ChartRow[] {
  // Pre-fill all 24 hours
  const map = new Map<number, ChartRow>();
  for (let h = 0; h < 24; h++) {
    const label = `${h.toString().padStart(2, "0")}:00`;
    map.set(h, emptyRow(label));
  }

  for (const row of raw) {
    const h = row.hour ?? 0;
    const entry = map.get(h);
    if (entry) {
      entry[row.feature] = (entry[row.feature] as number || 0) + row.total_tokens;
    }
  }
  return Array.from(map.values());
}

export default function AiCreditUsageChart() {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ViewMode>("monthly");
  const [data, setData] = useState<ChartRow[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint =
        mode === "monthly"
          ? "/credits/monthly"
          : mode === "weekly"
          ? "/credits/weekly"
          : "/credits/daily";
      const raw = await api<Record<string, unknown>[]>(endpoint);

      const pivoted =
        mode === "monthly"
          ? pivotMonthly(raw)
          : mode === "weekly"
          ? pivotWeekly(raw)
          : pivotDaily(raw);

      setData(pivoted);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getButtonClass = (m: ViewMode) =>
    mode === m
      ? "shadow-theme-xs text-gray-900 dark:text-white bg-white dark:bg-gray-800"
      : "text-gray-500 dark:text-gray-400";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      {/* Header */}
      <div className="flex flex-col gap-5 mb-6 sm:flex-row sm:justify-between">
        <div className="w-full">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            AI Credit Usage
          </h3>
          <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
            {mode === "monthly"
              ? "Token consumption per month (current year)"
              : mode === "weekly"
              ? "Token consumption this week (Mon\u2013Fri)"
              : "Token consumption today (hourly)"}
          </p>
        </div>
        <div className="flex items-start w-full gap-3 sm:justify-end">
          <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
            {(["monthly", "weekly", "daily"] as ViewMode[]).map((m) => (
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

      {/* Chart */}
      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div className="min-w-[1000px] xl:min-w-full h-[370px]">
          {loading ? (
            <Skeleton className="h-full w-full rounded-xl" />
          ) : (
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data}
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "#6B7280" }}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                    }
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(label) => String(label)}
                      />
                    }
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) =>
                      chartConfig[value]?.label ?? value
                    }
                  />
                  {FEATURES.map((f) => (
                    <Line
                      key={f.key}
                      type="monotone"
                      dataKey={f.key}
                      name={f.key}
                      stroke={f.color}
                      strokeWidth={2}
                      dot={{ r: 3, fill: f.color }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </div>
      </div>
    </div>
  );
}
