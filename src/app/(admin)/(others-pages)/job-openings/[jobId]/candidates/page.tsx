import type { Metadata } from "next";
import React from "react";
import CandidatesView from "@/components/candidates/CandidatesView";

export const metadata: Metadata = {
  title: "CGB Solutions - Candidates",
  description: "Candidates for this opening",
};

export default async function CandidatesPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <CandidatesView jobId={Number(jobId)} />;
}
