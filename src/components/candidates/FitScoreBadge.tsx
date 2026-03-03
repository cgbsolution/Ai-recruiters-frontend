"use client";
import React from "react";
import { RefreshCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type FitLevel = "high" | "medium" | "low" | null | undefined;

interface FitScoreReasoning {
  summary?: string;
  percentage?: number;
  key_matching_skills?: string[];
  relevant_experience_summary?: string;
  missing_weak_areas?: string[];
  breakdown?: {
    experience_match?: string;
    skills_match?: string;
    tech_stack_alignment?: string;
    role_alignment?: string;
  };
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
    bar: "bg-green-500",
    label: "HIGH FIT",
    levelBadge: "bg-green-900/50 text-green-300 border-green-700",
  },
  medium: {
    chip: "bg-yellow-100 text-yellow-800 border border-yellow-300",
    dot: "bg-yellow-400",
    bar: "bg-yellow-400",
    label: "MEDIUM FIT",
    levelBadge: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  },
  low: {
    chip: "bg-red-100 text-red-800 border border-red-300",
    dot: "bg-red-500",
    bar: "bg-red-500",
    label: "LOW FIT",
    levelBadge: "bg-red-900/50 text-red-300 border-red-700",
  },
};

export default function FitScoreBadge({
  fitLevel,
  reasoning,
  onRecompute,
  recomputing,
}: FitScoreBadgeProps) {
  let parsed: FitScoreReasoning | null = null;

  try {
    if (reasoning) parsed = JSON.parse(reasoning);
  } catch {}

  // Treat 0 as "not computed" — LLM defaults to 0 on parse failure
  const rawPct = parsed?.percentage;
  const percentage =
    rawPct !== undefined && rawPct !== null && rawPct > 0 ? rawPct : null;

  const hasRichData =
    parsed !== null &&
    (percentage !== null ||
      (parsed.key_matching_skills && parsed.key_matching_skills.length > 0) ||
      !!parsed.relevant_experience_summary ||
      !!parsed.summary);

  if (!fitLevel) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 text-xs font-medium border border-gray-200">
        <span className="w-2 h-2 rounded-full bg-gray-300" />
        N/A
      </span>
    );
  }

  const cfg = FIT_CONFIG[fitLevel] ?? FIT_CONFIG.low;
  const pct = percentage ?? 0;
  const badgeLabel =
    percentage !== null ? `${percentage}% – ${cfg.label}` : cfg.label;

  const TooltipBody = (
    <div className="w-80 text-sm space-y-3 p-1">

      {/* ── Hero: Match percentage ── */}
      <div>
        <div className="flex items-end justify-between mb-1.5">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">
              JD Match Score
            </p>
            <span
              className={`text-3xl font-extrabold ${
                percentage !== null ? "text-white" : "text-gray-500"
              }`}
            >
              {percentage !== null ? `${percentage}%` : "—"}
            </span>
          </div>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.levelBadge}`}
          >
            {cfg.label}
          </span>
        </div>

        <div className="h-2 bg-gray-600 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {percentage !== null && (
          <p className="text-xs text-gray-400 mt-1">
            {pct}% match against job requirements
          </p>
        )}
      </div>

      {/* ── Match score not available ── */}
      {!hasRichData && (
        <>
          <div className="border-t border-gray-600" />
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400 italic">
              Match score not available
            </p>
            {onRecompute && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRecompute();
                }}
                disabled={recomputing}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline disabled:opacity-50 transition-colors"
              >
                <RefreshCw
                  className={`w-3 h-3 ${recomputing ? "animate-spin" : ""}`}
                />
                {recomputing ? "Computing…" : "Recompute score"}
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Key Matching Skills ── */}
      {parsed?.key_matching_skills && parsed.key_matching_skills.length > 0 && (
        <>
          <div className="border-t border-gray-600" />
          <div>
            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-1.5">
              Key Matching Skills
            </p>
            <div className="flex flex-wrap gap-1">
              {parsed.key_matching_skills.map((skill, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 rounded bg-green-900/60 text-green-300 text-xs border border-green-700"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Relevant Experience Summary ── */}
      {parsed?.relevant_experience_summary && (
        <>
          <div className="border-t border-gray-600" />
          <div>
            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-1">
              Relevant Experience
            </p>
            <p className="text-xs text-gray-300 leading-relaxed">
              {parsed.relevant_experience_summary}
            </p>
          </div>
        </>
      )}

      {/* ── Missing / Weak Areas ── */}
      {parsed?.missing_weak_areas && parsed.missing_weak_areas.length > 0 && (
        <>
          <div className="border-t border-gray-600" />
          <div>
            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-1">
              Missing / Weak Areas
            </p>
            <ul className="space-y-0.5">
              {parsed.missing_weak_areas.map((area, i) => (
                <li key={i} className="flex gap-1.5 text-xs text-red-300">
                  <span className="mt-0.5 shrink-0">✕</span>
                  <span>{area}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* ── Refresh score (when rich data exists) ── */}
      {hasRichData && onRecompute && (
        <>
          <div className="border-t border-gray-600" />
          <div className="flex justify-end">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRecompute();
              }}
              disabled={recomputing}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-50 transition-colors"
            >
              <RefreshCw
                className={`w-3 h-3 ${recomputing ? "animate-spin" : ""}`}
              />
              {recomputing ? "Recomputing…" : "Refresh score"}
            </button>
          </div>
        </>
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
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          {badgeLabel}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        className="bg-gray-800 text-white border-gray-700 z-50 p-3"
      >
        {TooltipBody}
      </TooltipContent>
    </Tooltip>
  );
}
