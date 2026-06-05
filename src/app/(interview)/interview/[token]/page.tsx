"use client";

import { useParams, useSearchParams } from "next/navigation";
import InterviewFlow from "@/components/interview/InterviewFlow";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function InterviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params?.token as string;
  const candidateEmail = searchParams?.get("candidate") || undefined;

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400 text-lg">Invalid interview link.</p>
      </div>
    );
  }

  return (
    <ErrorBoundary name="interview" reloadOnRecover>
      <InterviewFlow token={token} candidateEmail={candidateEmail} />
    </ErrorBoundary>
  );
}
