import type { Metadata } from "next";
import React from "react";
import ResumeDatabaseView from "@/components/resume-database/ResumeDatabaseView";

export const metadata: Metadata = {
  title: "Resume Database - AI Recruiters",
  description: "Central resume database for bulk upload and candidate matching",
};

export default function ResumeDatabasePage() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <ResumeDatabaseView />
    </div>
  );
}
