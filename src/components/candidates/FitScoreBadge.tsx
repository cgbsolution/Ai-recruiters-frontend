"use client";
import React from "react";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

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
  // New metadata-comparison format
  key_matching_skills?: string[];
  missing_skills?: string[];
  breakdown?: Record<string, BreakdownItem>;
  // Legacy AI format (still supported)
  percentage?: number;
  relevant_experience_summary?: string;
  missing_weak_areas?: string[];
  // AI 6-dimension scorer
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

// Friendly labels for breakdown dimensions
const DIMENSION_LABELS: Record<string, string> = {
  // Algorithmic scorer dimensions
  skills_overlap: "Skills Match",
  skills_tfidf: "Skills Similarity",
  title_similarity: "Job Title Match",
  experience_fit: "Experience Fit",
  education_match: "Education",
  certification_match: "Certifications",
  keyword_overlap: "Keyword Match",
  tech_stack_align: "Tech Stack",
  industry_relevance: "Industry",
  seniority_match: "Seniority Level",
  location_match: "Location",
  text_similarity: "Resume–JD Similarity",
  // AI 6-dimension scorer
  core_skills: "Core Skills",
  responsibility_match: "Responsibilities",
  tools_technology: "Tools & Tech",
  leadership_ownership: "Leadership",
  compliance_domain: "Compliance",
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

  // Support both new (fit_percentage) and legacy (percentage) format
  const rawPct = parsed?.fit_percentage ?? parsed?.percentage;
  const percentage =
    rawPct !== undefined && rawPct !== null && rawPct > 0 ? rawPct : null;

  const matchedSkills = parsed?.key_matching_skills ?? [];
  const missingSkills = parsed?.missing_skills ?? parsed?.missing_weak_areas ?? [];
  const breakdown = parsed?.breakdown;

  // AI 6-dimension score breakdown
  const aiScoreBreakdown = parsedDetails?.score_breakdown;
  const strengthMapping = parsedDetails?.strength_mapping;

  // Support fitLevel as "78%" or "high"/"medium"/"low"
  const pctFromLevel = fitLevel && fitLevel.endsWith("%")
    ? parseInt(fitLevel.replace("%", ""), 10)
    : null;

  // Use percentage from reasoning first, then from fitLevel string
  const resolvedPct = percentage ?? pctFromLevel;

  // Determine the actual fit level category
  const resolvedLevel: "high" | "medium" | "low" = (() => {
    if (fitLevel === "high" || fitLevel === "medium" || fitLevel === "low") return fitLevel;
    const pctVal = pctFromLevel ?? percentage ?? 0;
    if (pctVal >= 75) return "high";
    if (pctVal >= 40) return "medium";
    return "low";
  })();

  const hasRichData =
    parsed !== null &&
    (resolvedPct !== null ||
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
  const pct = resolvedPct ?? 0;
  const badgeLabel =
    resolvedPct !== null ? `${resolvedPct}% – ${cfg.label}` : cfg.label;

  // Top breakdown dimensions to show (sorted by contribution, top 5)
  const topDimensions = breakdown
    ? Object.entries(breakdown)
        .filter(([, val]) => val && typeof val === "object" && "score" in val)
        .map(([key, val]) => ({ key, ...val }))
        .sort((a, b) => b.contribution - a.contribution)
        .slice(0, 5)
    : [];

  const TooltipBody = (
    <div className="w-80 max-h-[70vh] overflow-y-auto text-sm space-y-3 p-1 scrollbar-thin" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}>

      {/* ── Hero: Match percentage ── */}
      <div>
        <div className="flex items-end justify-between mb-1.5">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">
              JD Match Score
            </p>
            <span
              className={`text-3xl font-extrabold ${
                resolvedPct !== null ? "text-white" : "text-gray-500"
              }`}
            >
              {resolvedPct !== null ? `${resolvedPct}%` : "—"}
            </span>
          </div>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.levelBadge}`}
          >
            {cfg.label}
          </span>
        </div>

        <Progress value={pct} className="h-2" />

        {parsed?.summary && (
          <p className="text-xs text-gray-400 mt-1.5">{parsed.summary}</p>
        )}
      </div>

      {/* ── Score not available ── */}
      {!hasRichData && (
        <>
          <div className="border-t border-gray-600" />
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400 italic">
              Match score not available
            </p>
            {onRecompute && (
              <Button
                variant="link"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onRecompute(); }}
                disabled={recomputing}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline disabled:opacity-50 transition-colors h-auto p-0"
              >
                <RefreshCw className={`w-3 h-3 ${recomputing ? "animate-spin" : ""}`} />
                {recomputing ? "Computing…" : "Recompute score"}
              </Button>
            )}
          </div>
        </>
      )}

      {/* ── Top Score Breakdown ── */}
      {topDimensions.length > 0 && (
        <>
          <div className="border-t border-gray-600" />
          <div>
            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">
              Score Breakdown
            </p>
            <div className="space-y-1.5">
              {topDimensions.map((dim) => (
                <div key={dim.key} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-28 truncate">
                    {DIMENSION_LABELS[dim.key] || dim.key}
                  </span>
                  <Progress value={dim.score} className="h-1.5 flex-1" />
                  <span className="text-xs text-gray-400 w-8 text-right font-mono">
                    {dim.score}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── AI Insights: simple summary from strength mapping ── */}
      {strengthMapping && (strengthMapping.strong_matches?.length || strengthMapping.gaps?.length) ? (
        <>
          <div className="border-t border-gray-600" />
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
              Recruiter Summary
            </p>
            <p className="text-xs text-gray-300 leading-relaxed">
              {(() => {
                const strong = strengthMapping.strong_matches?.slice(0, 3) ?? [];
                const gaps = strengthMapping.gaps?.slice(0, 2) ?? [];
                const parts: string[] = [];
                if (strong.length > 0) parts.push(`Strong in ${strong.join(", ")}.`);
                if (gaps.length > 0) parts.push(`Lacks ${gaps.join(", ")}.`);
                return parts.join(" ") || "See skill details below.";
              })()}
            </p>
          </div>
        </>
      ) : null}

      {/* ── Strength Mapping ── */}
      {strengthMapping && (strengthMapping.strong_matches?.length || strengthMapping.partial_matches?.length || strengthMapping.gaps?.length) ? (
        <>
          <div className="border-t border-gray-600" />
          <div className="space-y-2">
            {strengthMapping.strong_matches && strengthMapping.strong_matches.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-green-400 mb-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Strong Matches
                </p>
                <ul className="text-xs text-gray-300 space-y-0.5 pl-4 list-disc">
                  {strengthMapping.strong_matches.slice(0, 4).map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
            {strengthMapping.partial_matches && strengthMapping.partial_matches.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-yellow-400 mb-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Partial Matches
                </p>
                <ul className="text-xs text-gray-300 space-y-0.5 pl-4 list-disc">
                  {strengthMapping.partial_matches.slice(0, 3).map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
            {strengthMapping.gaps && strengthMapping.gaps.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-400 mb-1 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Gaps
                </p>
                <ul className="text-xs text-gray-300 space-y-0.5 pl-4 list-disc">
                  {strengthMapping.gaps.slice(0, 3).map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      ) : null}

      {/* ── Verdict ── */}
      {parsed?.verdict && (
        <>
          <div className="border-t border-gray-600" />
          <p className="text-xs text-gray-300 italic">{parsed.verdict}</p>
        </>
      )}

      {/* ── Key Matching Skills ── */}
      {matchedSkills.length > 0 && (
        <>
          <div className="border-t border-gray-600" />
          <div>
            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-400" />
              Matching Skills ({matchedSkills.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {matchedSkills.map((skill, i) => (
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

      {/* ── Missing Skills ── */}
      {missingSkills.length > 0 && (
        <>
          <div className="border-t border-gray-600" />
          <div>
            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <XCircle className="w-3 h-3 text-red-400" />
              Missing Skills ({missingSkills.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {missingSkills.map((skill, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 text-xs border border-red-800"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Legacy: Relevant Experience Summary ── */}
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

      {/* ── Refresh score ── */}
      {hasRichData && onRecompute && (
        <>
          <div className="border-t border-gray-600" />
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onRecompute(); }}
              disabled={recomputing}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-50 transition-colors h-auto p-0"
            >
              <RefreshCw className={`w-3 h-3 ${recomputing ? "animate-spin" : ""}`} />
              {recomputing ? "Recomputing…" : "Refresh score"}
            </Button>
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
