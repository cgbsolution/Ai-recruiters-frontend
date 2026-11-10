import type { Metadata } from "next";
import React from "react";
import AskmiraConnectionView from "@/components/askmira/AskmiraConnectionView";

export const metadata: Metadata = {
  title: "AskMiraa connection - AI Recruiters",
  description: "Connect AskMiraa, the HRMS, with a one-time key",
};

export default function AskmiraConnectionPage() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <AskmiraConnectionView />
    </div>
  );
}
