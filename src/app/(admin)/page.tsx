import type { Metadata } from "next";
import React from "react";
import { JobsDataCard } from "@/components/cards/JobsDataCard";
import HiringFunnelCharts from "@/components/charts/HiringFunnelCharts";
import LineStatisticsChart from "@/components/charts/LineStatisticsChart";
import AiCreditUsageChart from "@/components/charts/AiCreditUsageChart";
import AiUsageAnalytics from "@/components/charts/AiUsageAnalytics";
import { JobsOpeningsCard } from "@/components/cards/JobOpeningsCard";
import SuperAdminOnly from "@/components/dashboard/SuperAdminOnly";
import DashboardHeader from "@/components/dashboard/DashboardHeader";

export const metadata: Metadata = {
  title: "CGB Solutions - Ai Recruiters",
  description: "Ai Recruiters Web App",
};

export default function Dashboard() {
  return (
    <>
      <DashboardHeader />
      <JobsDataCard />
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 space-y-6 xl:col-span-6">
          <HiringFunnelCharts />
        </div>

        <div className="col-span-12 space-y-6 xl:col-span-6">
          <LineStatisticsChart />
        </div>

        {/* AI Usage Analytics & Credits — Super Admin only */}
        <SuperAdminOnly>
          <div className="col-span-12 space-y-6">
            <AiUsageAnalytics />
          </div>

          <div className="col-span-12 space-y-6">
            <AiCreditUsageChart />
          </div>
        </SuperAdminOnly>

        <div className="col-span-12 space-y-6 xl:col-span-12">
          <JobsOpeningsCard />
        </div>
      </div>
    </>
  );
}
