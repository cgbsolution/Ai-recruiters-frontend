import type { Metadata } from "next";
import React from "react";
import { notFound } from "next/navigation";
import CandidatesView from "@/components/candidates/CandidatesView";
import { isRef } from "@/lib/refs";

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
  // The URL segment is the job's opaque ref; numeric ids (or anything else)
  // are "not found" and never reach the API.
  if (!isRef(jobId)) notFound();
  return <CandidatesView jobId={jobId} />;
}
