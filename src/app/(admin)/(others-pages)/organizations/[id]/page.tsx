import type { Metadata } from "next";
import React from "react";
import OrgDashboardView from "@/components/organizations/OrgDashboardView";
import { isRef } from "@/lib/refs";

export const metadata: Metadata = {
  title: "Organization Dashboard - AI Recruiters",
};

export default async function OrgDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* The URL segment is an org ref (never a numeric id) — anything else is not found. */}
      {isRef(id) ? (
        <OrgDashboardView orgId={id} />
      ) : (
        <div className="text-center py-20 text-gray-500">Organization not found.</div>
      )}
    </div>
  );
}
