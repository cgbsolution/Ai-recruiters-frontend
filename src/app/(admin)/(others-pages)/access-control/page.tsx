import type { Metadata } from "next";
import React from "react";
import AccessControlView from "@/components/access-control/AccessControlView";

export const metadata: Metadata = {
  title: "Access Control - AI Recruiters",
  description: "Manage user roles and permissions",
};

export default function AccessControlPage() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <AccessControlView />
    </div>
  );
}
