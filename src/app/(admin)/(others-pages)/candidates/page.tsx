import type { Metadata } from "next";
import React from "react";
// import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CandidateCards from "@/components/cards/CandisatesCard";

export const metadata: Metadata = {
  title: "CGB Solutions - Ai Recruiters",
  description: "Ai Recruiters Web App",
};

export default function Candidates() {
  return (
    <>
      <div>
        {/* <PageBreadcrumb pageTitle="Dashboard" />   */}
            <CandidateCards />
        {/* <div className="min-h-screen rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
          <div className="mx-auto w-full max-w-[630px] text-center">
            <h3 className="mb-4 font-semibold text-gray-800 text-theme-xl dark:text-white/90 sm:text-2xl">
              Dashboard Content
            </h3>
          </div>
        </div> */}
      </div>
    </>
  );
}
