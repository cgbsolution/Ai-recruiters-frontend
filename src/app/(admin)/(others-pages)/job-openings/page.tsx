import type { Metadata } from "next";
import React from "react";
import { JobsDataCard } from "@/components/cards/JobsDataCard";
import { JobsOpeningsCard } from "@/components/cards/JobOpeningsCard";

export const metadata: Metadata = {
  title: "CGB Solutions - Ai Recruiters",
  description: "Ai Recruiters Web App",
};

export default function JobOpenings() {
  return (
    <div className="space-y-6" data-tour="job-openings-page">
      <JobsDataCard />
      <JobsOpeningsCard />
    </div>
  );
}
