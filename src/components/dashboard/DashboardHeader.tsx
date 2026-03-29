"use client";

import { useAuth } from "@/context/AuthContext";
import SidebarWidget from "@/components/ui/layout/SidebarWidget";

export default function DashboardHeader() {
  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] || "there";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="text-xl xl:text-title-lg font-semibold text-gray-800 dark:text-white/90">
          Welcome back, {firstName} 👋
        </h1>
        <p className="text-sm text-gray-400 dark:text-gray-400 sm:text-base">
          Here's what you need to focus on today
        </p>
      </div>
      <nav>
        <SidebarWidget />
      </nav>
    </div>
  );
}
