import type { Metadata } from "next";
import { Suspense } from "react";
import AuditView from "@/components/talent/AuditView";

export const metadata: Metadata = {
  title: "Talent Agent audit - AI Recruiters",
  description: "Every message, AI score, human decision and deletion",
};

export default function TalentAuditPage() {
  return (
    <div className="p-4 md:p-6">
      <Suspense>
        <AuditView />
      </Suspense>
    </div>
  );
}
