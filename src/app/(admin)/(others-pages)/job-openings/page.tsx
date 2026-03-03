import type { Metadata } from "next";
import React from "react";
// import PageBreadcrumb from "@/components/common/PageBreadCrumb";
// import { JobsDataCard } from "@/components/cards/JobsDataCard";
// import HiringFunnelCharts from "@/components/charts/HiringFunnelCharts";
import { JobsOpeningsCard } from "@/components/cards/JobOpeningsCard";

export const metadata: Metadata = {
  title: "CGB Solutions - Ai Recruiters",
  description: "Ai Recruiters Web App",
};

export default function JobOpenings() {
  return (
    <>
      <div>
        {/* <PageBreadcrumb pageTitle="Dashboard" /> */}
        <div className="col-span-12 space-y-6 xl:col-span-12">
          <JobsOpeningsCard />
        </div>
      </div>
    </>
  );
}
