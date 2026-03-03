"use client";
import { useState, useEffect } from "react";
import { MoreDotIcon } from "@/components/ui/icons";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { Dropdown } from "../ui/dropdown/Dropdown";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export default function HiringFunnelCharts() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [heights, setHeights] = useState<number[]>([]);

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  // Simulate data loading (replace with your API call later)
  useEffect(() => {
    setTimeout(() => {
      setData([
        { month: "Jan", sales: 168 },
        { month: "Feb", sales: 385 },
        { month: "Mar", sales: 201 },
        { month: "Apr", sales: 298 },
        { month: "May", sales: 187 },
        { month: "Jun", sales: 195 },
        { month: "Jul", sales: 291 },
        { month: "Aug", sales: 110 },
        { month: "Sep", sales: 215 },
        { month: "Oct", sales: 390 },
        { month: "Nov", sales: 280 },
        { month: "Dec", sales: 112 },
      ]);
      setLoading(false);
    }, 1000); // fake 2s loading
    // generate random only on client
    setHeights(Array.from({ length: 30 }, () => 40 + Math.random() * 100));
  }, []);

  const chartConfig = {
    sales: {
      label: "Sales",
      color: "#465fff",
    },
  } satisfies ChartConfig;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="flex items-center justify-between">
        <div className="pb-3">
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white/90 ">
            Hiring Funnel
          </h3>
          <p className="text-sm text-gray-400 dark:text-gray-400 sm:text-base">
            Track candidate progression through stages
          </p>
        </div>
        <div className="relative inline-block">
          <button onClick={toggleDropdown} className="dropdown-toggle">
            <MoreDotIcon className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300" />
          </button>
          <Dropdown
            isOpen={isOpen}
            onClose={closeDropdown}
            className="w-40 p-2"
          >
            <DropdownItem
              onItemClick={closeDropdown}
              className="flex w-full font-normal text-left text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              View More
            </DropdownItem>
            <DropdownItem
              onItemClick={closeDropdown}
              className="flex w-full font-normal text-left text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              Delete
            </DropdownItem>
          </Dropdown>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto custom-scrollbar mt-4">
        <div className="-ml-2 min-w-[650px] xl:min-w-full">
          {loading ? (
            <div className="flex items-end gap-2 h-[180px]">
              {(heights.length ? heights : Array(30).fill(80)).map((h, i) => (
                <Skeleton
                  key={i}
                  className="flex-1 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-full w-full">
              <BarChart data={data}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="sales"
                  fill={chartConfig.sales.color}
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          )}
        </div>
      </div>
    </div>
  );
}
