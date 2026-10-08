import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your profile",
  // Candidate pages are reached only through private links.
  robots: { index: false, follow: false },
};

export default function TalentCandidateLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-50 text-gray-900">{children}</div>;
}
