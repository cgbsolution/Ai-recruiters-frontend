import type { Metadata } from "next";
import JobsList from "@/components/talent/JobsList";

export const metadata: Metadata = {
  title: "Job matches - AI Recruiters",
  description: "Ranked candidates for each opening and the precision@10 report",
};

export default function TalentJobsPage() {
  return (
    <div className="p-4 md:p-6">
      <JobsList />
    </div>
  );
}
