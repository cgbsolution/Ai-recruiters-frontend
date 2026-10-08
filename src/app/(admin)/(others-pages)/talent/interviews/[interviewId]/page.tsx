import type { Metadata } from "next";
import InterviewReview from "@/components/talent/InterviewReview";

export const metadata: Metadata = {
  title: "Interview review - AI Recruiters",
  description: "Transcript, rubric scores with quotes, summary and overrides",
};

export default async function TalentInterviewPage({ params }: { params: Promise<{ interviewId: string }> }) {
  const { interviewId } = await params;
  return (
    <div className="p-4 md:p-6">
      <InterviewReview interviewId={interviewId} />
    </div>
  );
}
