"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingDown,
  TrendingUp,
  Briefcase,
  CheckCircle2,
  Calendar,
  Trophy,
  Hourglass,
  Minus,
  LucideIcon,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

// ── Types ───────────────────────────────────────────────────────────────────

type Stat = {
  label: string;
  value: number;
  change: number;
  color: "error" | "warning" | "success" | "brand";
  chartData: { name: string; value: number }[];
};

type Theme = {
  icon: LucideIcon;
  chipBg: string;
  chipIcon: string;
  stroke: string;
  gradientFrom: string;
  gradientTo: string;
  glowRing: string;
};

// Per-metric visual theme — keyed by card order so the dashboard
// reads as a rhythmic palette, not 5 identical cards.
const THEMES: Theme[] = [
  {
    // Active Jobs — indigo
    icon: Briefcase,
    chipBg: "bg-indigo-50 dark:bg-indigo-500/15",
    chipIcon: "text-indigo-600 dark:text-indigo-300",
    stroke: "#6366f1",
    gradientFrom: "rgba(99,102,241,0.35)",
    gradientTo: "rgba(99,102,241,0)",
    glowRing: "group-hover:ring-indigo-200/60 dark:group-hover:ring-indigo-500/30",
  },
  {
    // Finished Jobs — emerald
    icon: CheckCircle2,
    chipBg: "bg-emerald-50 dark:bg-emerald-500/15",
    chipIcon: "text-emerald-600 dark:text-emerald-300",
    stroke: "#10b981",
    gradientFrom: "rgba(16,185,129,0.35)",
    gradientTo: "rgba(16,185,129,0)",
    glowRing: "group-hover:ring-emerald-200/60 dark:group-hover:ring-emerald-500/30",
  },
  {
    // Interview Schedule — amber
    icon: Calendar,
    chipBg: "bg-amber-50 dark:bg-amber-500/15",
    chipIcon: "text-amber-600 dark:text-amber-300",
    stroke: "#f59e0b",
    gradientFrom: "rgba(245,158,11,0.35)",
    gradientTo: "rgba(245,158,11,0)",
    glowRing: "group-hover:ring-amber-200/60 dark:group-hover:ring-amber-500/30",
  },
  {
    // Hire Rates — violet
    icon: Trophy,
    chipBg: "bg-violet-50 dark:bg-violet-500/15",
    chipIcon: "text-violet-600 dark:text-violet-300",
    stroke: "#8b5cf6",
    gradientFrom: "rgba(139,92,246,0.35)",
    gradientTo: "rgba(139,92,246,0)",
    glowRing: "group-hover:ring-violet-200/60 dark:group-hover:ring-violet-500/30",
  },
  {
    // Waiting Response — rose
    icon: Hourglass,
    chipBg: "bg-rose-50 dark:bg-rose-500/15",
    chipIcon: "text-rose-600 dark:text-rose-300",
    stroke: "#f43f5e",
    gradientFrom: "rgba(244,63,94,0.35)",
    gradientTo: "rgba(244,63,94,0)",
    glowRing: "group-hover:ring-rose-200/60 dark:group-hover:ring-rose-500/30",
  },
];

// ── Individual card ─────────────────────────────────────────────────────────

interface StatCardProps {
  stat: Stat;
  theme: Theme;
  animationDelayMs?: number;
}

function StatCard({ stat, theme, animationDelayMs = 0 }: StatCardProps) {
  const { icon: Icon } = theme;
  const isPositive = stat.change > 0;
  const isNegative = stat.change < 0;
  const isFlat = stat.change === 0;
  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

  const trendColor = isPositive
    ? "text-emerald-600 bg-emerald-50 ring-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/15 dark:ring-emerald-500/30"
    : isNegative
    ? "text-rose-600 bg-rose-50 ring-rose-100 dark:text-rose-300 dark:bg-rose-500/15 dark:ring-rose-500/30"
    : "text-gray-600 bg-gray-50 ring-gray-100 dark:text-gray-300 dark:bg-white/5 dark:ring-white/10";

  // Unique gradient id for chart fill (avoids clashes across cards)
  const gradientId = useMemo(
    () => `spark-${stat.label.replace(/\s+/g, "-").toLowerCase()}`,
    [stat.label],
  );

  return (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200/70 bg-white/80 p-5 shadow-sm ring-1 ring-transparent backdrop-blur-sm transition-all duration-300 ease-out",
        "hover:-translate-y-0.5 hover:shadow-xl hover:shadow-gray-200/60",
        "dark:border-white/10 dark:bg-gray-900/60 dark:shadow-black/20",
        theme.glowRing,
      )}
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      {/* Top row: icon chip + label (gets the full row — no longer squeezed by a pill) */}
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", theme.chipBg)}>
          <Icon className={cn("h-4 w-4", theme.chipIcon)} />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-600 dark:text-gray-300">
          {stat.label}
        </p>
      </div>

      {/* Value + trend pill + sparkline */}
      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-3xl font-bold leading-none tabular-nums tracking-tight text-gray-900 dark:text-white">
            {stat.value.toLocaleString()}
          </p>
          <span
            className={cn(
              "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
              trendColor,
            )}
            title={`${isFlat ? "No change" : isPositive ? "Up" : "Down"} ${Math.abs(stat.change)}% compared to the previous 30 days`}
          >
            <TrendIcon className="h-3 w-3" />
            {isFlat ? "0" : isPositive ? `+${Math.abs(stat.change)}` : `-${Math.abs(stat.change)}`}%
          </span>
        </div>

        {/* Sparkline: gradient area chart */}
        <div className="h-12 w-24 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stat.chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.gradientFrom} />
                  <stop offset="100%" stopColor={theme.gradientTo} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={theme.stroke}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                isAnimationActive
                animationDuration={900}
                animationEasing="ease-out"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white/70 p-5 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-gray-900/40">
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <Skeleton className="h-12 w-24" />
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export const JobsDataCard = () => {
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const data = await api<Stat[]>("/jobs/stats", { timeout: 10_000 });
        setStats(data);
      } catch (err) {
        console.error("Error fetching stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, idx) => (
          <StatCardSkeleton key={idx} />
        ))}
      </div>
    );
  }

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {stats.map((card, idx) => (
        <StatCard
          key={card.label}
          stat={card}
          theme={THEMES[idx % THEMES.length]}
          animationDelayMs={idx * 60}
        />
      ))}
    </div>
  );
};
