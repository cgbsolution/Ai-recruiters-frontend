"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useGlobalModal } from "@/context/ModalContext";
import { Button } from "@/components/ui/button";
import { Plus, Sparkles } from "lucide-react";
import { AIAssistantButton } from "@/components/ai-assistant/AIAssistantButton";

function getGreeting(): { greeting: string; emoji: string; subtitle: string } {
  const h = new Date().getHours();
  if (h < 5) return { greeting: "Working late", emoji: "🌙", subtitle: "Here's your hiring snapshot — don't forget to rest." };
  if (h < 12) return { greeting: "Good morning", emoji: "☀️", subtitle: "Here's your hiring performance today" };
  if (h < 17) return { greeting: "Good afternoon", emoji: "🌤️", subtitle: "Here's where things stand this afternoon" };
  if (h < 21) return { greeting: "Good evening", emoji: "🌆", subtitle: "Here's what happened today" };
  return { greeting: "Good night", emoji: "✨", subtitle: "Here's your end-of-day hiring snapshot" };
}

function getInitials(name?: string) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function DashboardHeader() {
  const { user } = useAuth();
  const { openModal } = useGlobalModal();
  const firstName = user?.name?.split(" ")[0] || "there";
  const [info, setInfo] = useState(getGreeting());

  // Refresh greeting if the tab stays open across time-of-day boundaries
  useEffect(() => {
    const t = setInterval(() => setInfo(getGreeting()), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/70 p-5 sm:p-6 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-gray-900 dark:to-purple-500/10">
      {/* Decorative glow blobs */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-purple-200/40 blur-3xl dark:bg-purple-500/10" />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Avatar + greeting */}
        <div className="flex items-center gap-4">
          {/* Avatar with online status dot */}
          <div className="relative shrink-0">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-sm font-semibold text-white shadow-md ring-4 ring-white dark:ring-gray-900 sm:h-14 sm:w-14 sm:text-base">
              {getInitials(user?.name)}
            </div>
            <span
              aria-label="Online"
              className="absolute bottom-0.5 right-0.5 flex h-3 w-3 items-center justify-center"
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-gray-900" />
            </span>
          </div>

          <div className="min-w-0">
            {/* Eyebrow: date + small AI-insight badge */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              <span>{formatToday()}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 shadow-sm ring-1 ring-indigo-100 dark:bg-gray-900/70 dark:text-indigo-300 dark:ring-indigo-500/30">
                <Sparkles className="h-2.5 w-2.5" />
                AI Insights
              </span>
            </div>

            {/* Main greeting */}
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl dark:text-white">
              {info.greeting},{" "}
              <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_auto] bg-clip-text text-transparent animate-gradient-x">
                {firstName}
              </span>{" "}
              <span className="inline-block origin-[70%_70%] animate-wave">
                {info.emoji}
              </span>
            </h1>

            <p className="mt-0.5 text-sm text-gray-500 sm:text-[15px] dark:text-gray-400">
              {info.subtitle}
            </p>
          </div>
        </div>

        {/* Right: CTAs — AI Assistant + Create Opening */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <AIAssistantButton />

          <Button
            onClick={openModal}
            className="group relative h-11 shrink-0 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-5 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/25 hover:from-indigo-600 hover:to-purple-600 active:translate-y-0"
          >
            {/* shimmer sweep */}
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
            <span>Create Opening</span>
          </Button>
        </div>
      </div>

      {/* Local keyframes: wave + gradient-x */}
      <style jsx>{`
        @keyframes wave {
          0%, 60%, 100% { transform: rotate(0deg); }
          10% { transform: rotate(14deg); }
          20% { transform: rotate(-8deg); }
          30% { transform: rotate(14deg); }
          40% { transform: rotate(-4deg); }
          50% { transform: rotate(10deg); }
        }
        :global(.animate-wave) {
          animation: wave 2.6s ease-in-out infinite;
        }
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        :global(.animate-gradient-x) {
          animation: gradient-x 6s ease-in-out infinite;
        }
      `}</style>
    </section>
  );
}
