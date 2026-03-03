"use client";

import { useParams } from "next/navigation";
import InterviewFlow from "@/components/interview/InterviewFlow";

export default function InterviewPage() {
  const params = useParams();
  const token = params?.token as string;

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400 text-lg">Invalid interview link.</p>
      </div>
    );
  }

  return <InterviewFlow token={token} />;
}
