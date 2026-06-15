import Calendar from "@/components/calendar/Calendar";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Interview Calendar | CGB AI Recruiters",
  description:
    "Tenant-scoped interview schedule calendar — view, filter, and track interviews by status across month, week, and day views.",
};
export default function page() {
  return (
    <div data-tour="calendar-page">
      <PageBreadcrumb pageTitle="Calendar" />
      <Calendar />
    </div>
  );
}
