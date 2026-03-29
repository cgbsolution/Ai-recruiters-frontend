import type { Metadata } from "next";
import React from "react";
import OrganizationsView from "@/components/organizations/OrganizationsView";

export const metadata: Metadata = {
  title: "Organizations - AI Recruiters",
  description: "Manage organizations and domain whitelisting",
};

export default function OrganizationsPage() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <OrganizationsView />
    </div>
  );
}
