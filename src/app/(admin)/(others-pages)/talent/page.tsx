import type { Metadata } from "next";
import CampaignConsole from "@/components/talent/CampaignConsole";

export const metadata: Metadata = {
  title: "Talent Agent - AI Recruiters",
  description: "Refresh campaigns, deliverability and the talent pool",
};

export default function TalentPage() {
  return (
    <div className="p-4 md:p-6">
      <CampaignConsole />
    </div>
  );
}
