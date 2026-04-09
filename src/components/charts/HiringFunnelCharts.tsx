"use client";
import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { api } from "@/lib/api";

type ViewMode = "monthly" | "weekly";

const STAGES = [
  { key: "applied", label: "Applied", color: "#FFA94D" },
  { key: "interview", label: "Interview", color: "#339AF0" },
  { key: "offered", label: "Offered", color: "#CC5DE8" },
  { key: "selected", label: "Selected", color: "#51CF66" },
  { key: "hired", label: "Hired", color: "#20C997" },
  { key: "rejected", label: "Rejected", color: "#FF6B6B" },
] as const;

const chartConfig: ChartConfig = Object.fromEntries(
  STAGES.map((s) => [s.key, { label: s.label, color: s.color }])
);

export default function HiringFunnelCharts() {
  const [mode, setMode] = useState<ViewMode>("monthly");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Record<string, string | number>[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Record<string, string | number>[]>(
        `/jobs/hiring-funnel?period=${mode}`,
        { timeout: 10_000 }
      );
      setData(res);
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
      <div className="flex flex-col gap-5 mb-6 sm:flex-row sm:justify-between">
        <div className="w-full">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Hiring Funnel
          </h3>
          <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
            {mode === "monthly"
              ? "Candidate progression by month (current year)"
              : "Candidate progression this week (Mon–Fri)"}
          </p>
        </div>
        <div className="flex items-start w-full gap-3 sm:justify-end">
          <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
            {(["monthly", "weekly"] as ViewMode[]).map((m) => (
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

      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div className="min-w-[650px] xl:min-w-full h-[300px]">
          {loading ? (
            <Skeleton className="h-full w-full rounded-xl" />
          ) : (
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "#6B7280" }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {STAGES.map((s) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.label}
                      stackId="funnel"
                      fill={s.color}
                      radius={[0, 0, 0, 0]}
                    />
                  ))}
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) =>
                      chartConfig[value]?.label ?? value
                    }
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </div>
      </div>
    </div>
  );
}
