import type { Metadata } from "next";
import JobMatchesView from "@/components/talent/JobMatchesView";

export const metadata: Metadata = {
  title: "Job matches - AI Recruiters",
  description: "Ranked matches with must-have evidence, gaps and risk flags",
};

export default async function TalentJobPage({ params }: { params: Promise<{ jobRef: string }> }) {
  const { jobRef } = await params;
  return (
    <div className="p-4 md:p-6">
      <JobMatchesView jobRef={jobRef} />
    </div>
  );
}
