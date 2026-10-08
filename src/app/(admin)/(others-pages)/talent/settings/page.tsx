import type { Metadata } from "next";
import TalentSettingsView from "@/components/talent/TalentSettingsView";

export const metadata: Metadata = {
  title: "Talent Agent settings - AI Recruiters",
  description: "Loop switches, send caps, quiet hours, consent text and retention",
};

export default function TalentSettingsPage() {
  return (
    <div className="p-4 md:p-6">
      <TalentSettingsView />
    </div>
  );
}
