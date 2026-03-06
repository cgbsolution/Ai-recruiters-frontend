"use client";
import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDown,TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { api } from "@/lib/api";

type Stat = {
  label: string;
  value: number;
  change: number;
  color: "error" | "warning" | "success" | "brand";
  chartData: { name: string; value: number }[];
};

export const JobsDataCard = () => {
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const data = await api<any>("/jobs/stats");
        setStats(data);
      } catch (err) {
        console.error("Error fetching stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, idx) => (
          <Card
            key={idx}
            className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6"
          >
            <Skeleton className="h-5 w-24 mb-3" />
            <Skeleton className="h-6 w-20 mb-2" />
            <Skeleton className="h-10 w-16" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((card, idx) => {
        const isPositive = card.change >= 0;
        const Icon = isPositive ? TrendingUp : TrendingDown;

        const chartConfig: ChartConfig = {
          value: {
            label: card.label,
            color: isPositive ? "#4f46e5" : "#ef4444", // theme colors
          },
        };

        return (
          <Card
            key={idx}
            className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 flex flex-col justify-between"
          >
            {/* Title */}
            <h5 className="text-gray-800 text-base font-medium pb-2">
              {card.label}
            </h5>

            {/* Change row with circle badge */}
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span
                className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  isPositive ? "bg-green-100" : "bg-red-100"
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
                {isPositive ? "+" : "-"}
                {Math.abs(card.change)}%
              </span>
            </div>

            {/* Number + Chart */}
            <CardContent className="p-0 mt-3 flex items-end justify-between">
              <h4 className="text-3xl font-bold text-gray-900">
                {card.value.toLocaleString()}
              </h4>

              <div className="w-20 h-10">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <BarChart
                    data={card.chartData}
                    margin={{ top: 5, right: 0, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="name" hide />
                    <YAxis hide />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="value"
                      fill={chartConfig.value.color}
                      radius={[4, 4, 0, 0]}
                      barSize={6} // wider bar
                      maxBarSize={10} // ensures less gap
                    />
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
