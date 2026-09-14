"use client";

import { useParams, useSearchParams } from "next/navigation";
import InterviewFlow from "@/components/interview/InterviewFlow";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function InterviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params?.token as string;
  // Personal invite link: /interview/{token}?invite={secret}. Older links carry
  // ?candidate={email} instead and still work for already-scheduled candidates.
  const inviteToken = searchParams?.get("invite") || undefined;
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
      <InterviewFlow token={token} inviteToken={inviteToken} candidateEmail={candidateEmail} />
    </ErrorBoundary>
  );
}
