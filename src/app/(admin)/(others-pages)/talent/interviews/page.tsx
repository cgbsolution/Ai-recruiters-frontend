import type { Metadata } from "next";
import InterviewsList from "@/components/talent/InterviewsList";

export const metadata: Metadata = {
  title: "Interviews - AI Recruiters",
  description: "Talent Agent interviews: scheduling, no-shows and reviews",
};

export default function TalentInterviewsPage() {
  return (
    <div className="p-4 md:p-6">
      <InterviewsList />
    </div>
  );
}
