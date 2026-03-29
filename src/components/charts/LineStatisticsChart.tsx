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

type ViewMode = "daily" | "weekly" | "monthly";

const chartConfig: ChartConfig = {
  active: { label: "Active Jobs", color: "#465fff" },
  finished: { label: "Finished Jobs", color: "#20C997" },
};

export default function LineStatisticsChart() {
  const [mode, setMode] = useState<ViewMode>("monthly");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Record<string, string | number>[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Record<string, string | number>[]>(
        `/jobs/jobs-chart?period=${mode}`
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
            Active Jobs
          </h3>
          <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
            {mode === "monthly"
              ? "Jobs created per month (current year)"
              : mode === "weekly"
              ? "Jobs created this week (Mon–Fri)"
              : "Jobs created today (hourly)"}
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

      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div className="min-w-[700px] xl:min-w-full h-[310px]">
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
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="active"
                    name="active"
                    stroke={chartConfig.active.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: chartConfig.active.color }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="finished"
                    name="finished"
                    stroke={chartConfig.finished.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: chartConfig.finished.color }}
                    activeDot={{ r: 6 }}
                    connectNulls
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
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </div>
      </div>
    </div>
  );
}
