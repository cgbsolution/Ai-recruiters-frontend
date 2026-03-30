import type { Metadata } from "next";
import React from "react";
import FileManagerView from "@/components/file-manager/FileManagerView";

export const metadata: Metadata = {
  title: "File Manager - AI Recruiters",
  description: "Manage backend upload files and directories",
};

export default function FileManagerPage() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <FileManagerView />
    </div>
  );
}
