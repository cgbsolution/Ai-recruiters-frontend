"use client";
import React from "react";
import { RefreshCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

type FitLevel = "high" | "medium" | "low" | string | null | undefined;

interface BreakdownItem {
  score: number;
  weight: number;
  contribution: number;
}

interface FitScoreReasoning {
  fit_percentage?: number;
  fit_level?: string;
  summary?: string;
  key_matching_skills?: string[];
  missing_skills?: string[];
  breakdown?: Record<string, BreakdownItem>;
  percentage?: number;
  relevant_experience_summary?: string;
  missing_weak_areas?: string[];
  verdict?: string;
  reasoning_points?: string[];
}

interface FitScoreDetails {
  score_breakdown?: Record<string, number>;
  strength_mapping?: {
    strong_matches?: string[];
    partial_matches?: string[];
    gaps?: string[];
  };
  breakdown?: Record<string, string>;
}

interface FitScoreBadgeProps {
  fitLevel: FitLevel;
  reasoning?: string | null;
  details?: string | null;
  onRecompute?: () => void;
  recomputing?: boolean;
}

const FIT_CONFIG = {
  high: {
    chip: "bg-green-100 text-green-800 border border-green-300",
    dot: "bg-green-500",
    label: "HIGH FIT",
    headerBg: "bg-green-500/20",
    headerBorder: "border-green-500/30",
    headerText: "text-green-300",
    indicator: "bg-green-500",
    tagline: "Strong alignment between JD and resume.",
  },
  medium: {
    chip: "bg-yellow-100 text-yellow-800 border border-yellow-300",
    dot: "bg-yellow-400",
    label: "MEDIUM FIT",
    headerBg: "bg-yellow-500/20",
    headerBorder: "border-yellow-500/30",
    headerText: "text-yellow-300",
    indicator: "bg-yellow-400",
    tagline: "Some relevant experience, but gaps exist.",
  },
  low: {
    chip: "bg-red-100 text-red-800 border border-red-300",
    dot: "bg-red-500",
    label: "LOW FIT",
    headerBg: "bg-red-500/20",
    headerBorder: "border-red-500/30",
    headerText: "text-red-300",
    indicator: "bg-red-500",
    tagline: "Limited skills overlap, experience gaps detected.",
  },
};

export default function FitScoreBadge({
  fitLevel,
  reasoning,
  details,
  onRecompute,
  recomputing,
}: FitScoreBadgeProps) {
  let parsed: FitScoreReasoning | null = null;
  let parsedDetails: FitScoreDetails | null = null;
  try {
    if (reasoning) parsed = JSON.parse(reasoning);
  } catch {}
  try {
    if (details) parsedDetails = JSON.parse(details);
  } catch {}

  const rawPct = parsed?.fit_percentage ?? parsed?.percentage;
  const percentage =
    rawPct !== undefined && rawPct !== null && rawPct > 0 ? rawPct : null;

  const pctFromLevel = fitLevel && fitLevel.endsWith("%")
    ? parseInt(fitLevel.replace("%", ""), 10)
    : null;

  const resolvedPct = percentage ?? pctFromLevel;

  const resolvedLevel: "high" | "medium" | "low" = (() => {
    if (fitLevel === "high" || fitLevel === "medium" || fitLevel === "low") return fitLevel;
    const pctVal = pctFromLevel ?? percentage ?? 0;
    if (pctVal >= 75) return "high";
    if (pctVal >= 40) return "medium";
    return "low";
  })();

  // Build reasoning bullets from AI analysis
  const reasoningBullets: string[] = [];

  // Priority 1: reasoning_points from AI scorer (most detailed)
  if (parsed?.reasoning_points && parsed.reasoning_points.length > 0) {
    reasoningBullets.push(...parsed.reasoning_points);
  }

  // Priority 2: Build from strength_mapping if no reasoning_points
  if (reasoningBullets.length === 0 && parsedDetails?.strength_mapping) {
    const sm = parsedDetails.strength_mapping;
    if (sm.strong_matches) {
      sm.strong_matches.forEach((m) => reasoningBullets.push(m));
    }
    if (sm.partial_matches) {
      sm.partial_matches.forEach((m) => reasoningBullets.push(m));
    }
    if (sm.gaps) {
      sm.gaps.forEach((m) => reasoningBullets.push(m));
    }
  }

  // Priority 3: Build from summary + breakdown text
  if (reasoningBullets.length === 0 && parsedDetails?.breakdown) {
    const bd = parsedDetails.breakdown;
    if (bd.experience_match) reasoningBullets.push(bd.experience_match);
    if (bd.skills_match) reasoningBullets.push(bd.skills_match);
    if (bd.tech_stack_alignment) reasoningBullets.push(bd.tech_stack_alignment);
    if (bd.role_alignment) reasoningBullets.push(bd.role_alignment);
  }

  // Priority 4: Build from matching/missing skills (smart scoring fallback)
  const matchedSkills = parsed?.key_matching_skills ?? [];
  const missingSkills = parsed?.missing_skills ?? parsed?.missing_weak_areas ?? [];

  if (reasoningBullets.length === 0) {
    if (matchedSkills.length > 0) {
      reasoningBullets.push(`Matching skills: ${matchedSkills.slice(0, 5).join(", ")}${matchedSkills.length > 5 ? ` and ${matchedSkills.length - 5} more` : ""}`);
    }
    if (missingSkills.length > 0) {
      reasoningBullets.push(`Missing skills: ${missingSkills.slice(0, 5).join(", ")}${missingSkills.length > 5 ? ` and ${missingSkills.length - 5} more` : ""}`);
    }
  }

  const hasContent =
    parsed !== null &&
    (resolvedPct !== null ||
      reasoningBullets.length > 0 ||
      matchedSkills.length > 0 ||
      missingSkills.length > 0 ||
      !!parsed.summary);

  if (!fitLevel) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 text-xs font-medium border border-gray-200">
        <span className="w-2 h-2 rounded-full bg-gray-300" />
        N/A
      </span>
    );
  }

  const cfg = FIT_CONFIG[resolvedLevel] ?? FIT_CONFIG.low;
  const badgeLabel =
    resolvedPct !== null ? `${resolvedPct}% \u2013 ${cfg.label}` : cfg.label;

  const TooltipBody = (
    <div
      className="w-[340px] max-h-[75vh] overflow-y-auto text-sm"
      style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}
    >
      {/* ── Glass Header ── */}
      <div className={`rounded-t-lg px-4 py-3 ${cfg.headerBg} border-b ${cfg.headerBorder}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-3 h-3 rounded-sm ${cfg.indicator}`} />
          <span className={`text-sm font-bold ${cfg.headerText} uppercase tracking-wide`}>
            {cfg.label}
          </span>
          {resolvedPct !== null && (
            <span className={`text-sm font-bold ${cfg.headerText} ml-auto`}>
              {resolvedPct}%
            </span>
          )}
        </div>
        <p className="text-xs text-gray-300/90 leading-relaxed">
          {parsed?.summary || cfg.tagline}
        </p>
      </div>

      {/* ── AI Reasoning Bullets ── */}
      {reasoningBullets.length > 0 && (
        <div className="px-4 py-3">
          <ul className="space-y-2.5">
            {reasoningBullets.slice(0, 7).map((point, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-gray-200">
                <span className="text-gray-400 mt-0.5 shrink-0">{"\u2022"}</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Verdict ── */}
      {parsed?.verdict && (
        <div className={`mx-4 mb-3 px-3 py-2 rounded ${cfg.headerBg} border ${cfg.headerBorder}`}>
          <p className="text-xs text-gray-200 leading-relaxed font-medium">
            {parsed.verdict}
          </p>
        </div>
      )}

      {/* ── No data state ── */}
      {!hasContent && (
        <div className="px-4 py-3">
          <p className="text-xs text-gray-400 italic">
            Score analysis not available yet.
          </p>
        </div>
      )}

      {/* ── Refresh button ── */}
      {onRecompute && (
        <div className="px-4 py-2 border-t border-white/5 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onRecompute(); }}
            disabled={recomputing}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-50 transition-colors h-auto p-0"
          >
            <RefreshCw className={`w-3 h-3 ${recomputing ? "animate-spin" : ""}`} />
            {recomputing ? "Analyzing\u2026" : "Refresh score"}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Tooltip delayDuration={100}>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity ${cfg.chip}`}
          aria-label={`${cfg.label}${percentage !== null ? ` - ${percentage}% JD match` : ""}`}
        >
          <span className={`w-2 h-2 rounded-sm ${cfg.dot}`} />
          {badgeLabel}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        sideOffset={8}
        className="p-0 border-0 rounded-lg shadow-2xl backdrop-blur-xl bg-gray-900/90 border border-white/10 overflow-hidden"
      >
        {TooltipBody}
      </TooltipContent>
    </Tooltip>
  );
}
