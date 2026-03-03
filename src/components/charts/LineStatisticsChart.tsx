"use client";
import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import ChartTab from "../common/ChartTab";

import { Skeleton } from "@/components/ui/skeleton"; // Import Skeleton
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export default function LineStatisticsChart() {
  const [loading, setLoading] = useState(true);

  // Simulate loading for 1 second
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const data = [
    { month: "Jan", Sales: 180, Revenue: 40 },
    { month: "Feb", Sales: 190, Revenue: 30 },
    { month: "Mar", Sales: 170, Revenue: 50 },
    { month: "Apr", Sales: 160, Revenue: 40 },
    { month: "May", Sales: 175, Revenue: 55 },
    { month: "Jun", Sales: 165, Revenue: 40 },
    { month: "Jul", Sales: 170, Revenue: 70 },
    { month: "Aug", Sales: 205, Revenue: 100 },
    { month: "Sep", Sales: 230, Revenue: 110 },
    { month: "Oct", Sales: 210, Revenue: 120 },
    { month: "Nov", Sales: 240, Revenue: 150 },
    { month: "Dec", Sales: 235, Revenue: 140 },
  ];

  const chartConfig = {
    Sales: { label: "Sales", color: "#8979FF" },
    Revenue: { label: "Revenue", color: "#8979FF" },
  } satisfies ChartConfig;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="flex flex-col gap-5 mb-6 sm:flex-row sm:justify-between">
        <div className="w-full">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Statistics
          </h3>
          <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
            Target you’ve set for each month
          </p>
        </div>
        <div className="flex items-start w-full gap-3 sm:justify-end">
          <ChartTab />
        </div>
      </div>

      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div className="min-w-[1000px] xl:min-w-full h-[310px]">
          {loading ? (
            // Skeleton while loading
            <Skeleton className="h-full w-full rounded-xl" />
          ) : (
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data}
                  margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
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
                  {/* <Line
                    type="monotone"
                    dataKey="Sales"
                    stroke={chartConfig.Sales.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: chartConfig.Sales.color }}
                    activeDot={{ r: 6 }}
                  /> */}
                  <Line
                    type="monotone"
                    dataKey="Revenue"
                    stroke={chartConfig.Revenue.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: chartConfig.Revenue.color }}
                    activeDot={{ r: 6 }}
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
