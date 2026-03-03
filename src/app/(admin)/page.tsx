import type { Metadata } from "next";
import React from "react";
// import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { JobsDataCard } from "@/components/cards/JobsDataCard";
import HiringFunnelCharts from "@/components/charts/HiringFunnelCharts";
import LineStatisticsChart from "@/components/charts/LineStatisticsChart";
import { JobsOpeningsCard } from "@/components/cards/JobOpeningsCard";
import SidebarWidget from "@/components/ui/layout/SidebarWidget";

export const metadata: Metadata = {
  title: "CGB Solutions - Ai Recruiters",
  description: "Ai Recruiters Web App",
};

export default function Dashboard() {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl xl:text-title-lg font-semibold text-gray-800 dark:text-white/90">
            Welcome back, Julie 👋
          </h1>
          <p className="text-sm text-gray-400 dark:text-gray-400 sm:text-base">
            Here’s what you need to focus on today
          </p>
        </div>
        <nav>
          <SidebarWidget />
        </nav>
      </div>
      <JobsDataCard />
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 space-y-6 xl:col-span-6">
          <HiringFunnelCharts />
        </div>

        <div className="col-span-12 space-y-6 xl:col-span-6">
          {/* <HiringFunnelCharts /> */}
          <LineStatisticsChart />
        </div>

        <div className="col-span-12 space-y-6 xl:col-span-12">
          {/* <HiringFunnelCharts /> */}
          <JobsOpeningsCard />
        </div>
      </div>
    </>
  );
}
