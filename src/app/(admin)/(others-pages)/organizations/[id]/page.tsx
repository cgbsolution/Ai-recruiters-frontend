import type { Metadata } from "next";
import React from "react";
import OrgDashboardView from "@/components/organizations/OrgDashboardView";

export const metadata: Metadata = {
  title: "Organization Dashboard - AI Recruiters",
};

export default async function OrgDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="p-4 md:p-6 space-y-6">
      <OrgDashboardView orgId={parseInt(id, 10)} />
    </div>
  );
}
