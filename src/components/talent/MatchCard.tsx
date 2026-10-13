"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Briefcase,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Loader2,
  MapPin,
  ThumbsDown,
  ThumbsUp,
  Wallet,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { notifyError } from "@/lib/notify";
import { DIMENSION_LABELS, fmtDate, talentPost, type MatchItem, type MustHave } from "@/lib/talent";
import { cn } from "@/lib/utils";
import { Pill } from "./TalentShell";

export type MatchRating = MatchItem["recruiter_rating"];

const MET = {
  yes: { icon: Check, label: "met", className: "text-emerald-600 dark:text-emerald-400" },
  no: { icon: X, label: "not met", className: "text-red-600 dark:text-red-400" },
  unclear: { icon: CircleHelp, label: "unclear", className: "text-amber-600 dark:text-amber-400" },
} as const;

/** The icon for a must-have's verdict (with its word for screen readers). */
export function MetIcon({ met, className }: { met: MustHave["met"]; className?: string }) {
  const v = MET[met] ?? MET.unclear;
  return <v.icon aria-label={v.label} className={cn("size-4 shrink-0", v.className, className)} />;
}

/** "Designation at Company", or a fallback. */
export function roleLine(p: MatchItem["profile"]): string {
  return [p.current_designation, p.current_company].filter(Boolean).join(" at ") || "Role not stated";
}

/** How many must-haves the evidence shows as met. */
export function mustHavesMet(m: MatchItem): { met: number; total: number } | null {
  if (!m.must_haves || m.must_haves.length === 0) return null;
  return { met: m.must_haves.filter((h) => h.met === "yes").length, total: m.must_haves.length };
}

function scoreTone(score: number | null): string {
  if (score == null) return "border-border bg-muted text-muted-foreground";
  if (score >= 75) return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (score >= 50) return "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300";
  if (score >= 30) return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300";
  return "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300";
}

/** The AI score (0-100) and the rank in a tile. */
function ScoreTile({ score, rank }: { score: number | null; rank: number }) {
  return (
    <div className={cn("flex size-12 shrink-0 flex-col items-center justify-center rounded-xl border tabular-nums", scoreTone(score))}>
      <span className="sr-only">AI score</span>
      <span className="text-lg leading-none font-semibold">{score ?? "—"}</span>
      <span className="mt-1 text-[10px] leading-none opacity-75">#{rank}</span>
    </div>
  );
}

/** Thumbs up / down for a match. Controlled: the caller keeps the rating. */
export function RatingButtons({
  matchId,
  rating,
  onRated,
  className,
}: {
  matchId: string;
  rating: MatchRating;
  onRated: (id: string, rating: MatchRating) => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const rate = async (relevant: boolean) => {
    const next: MatchRating = relevant ? "relevant" : "not_relevant";
    const value = rating === next ? null : relevant;
    setBusy(true);
    try {
      const r = await talentPost<{ recruiter_rating: MatchRating }>(`/matches/${matchId}/rating`, { relevant: value });
      onRated(matchId, r.recruiter_rating);
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const thumb = (relevant: boolean) => {
    const on = rating === (relevant ? "relevant" : "not_relevant");
    const label = relevant ? "Relevant" : "Not relevant";
    const Icon = relevant ? ThumbsUp : ThumbsDown;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={() => rate(relevant)}
            aria-pressed={on}
            aria-label={label}
            className={cn(
              "size-8 text-muted-foreground",
              on &&
                relevant &&
                "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25",
              on &&
                !relevant &&
                "bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-700 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25",
            )}
          >
            <Icon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{on ? `Rated ${label.toLowerCase()} — click to clear` : `Mark ${label.toLowerCase()}`}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div role="group" aria-label="Rate this match" className={cn("flex items-center gap-0.5", className)}>
      {busy ? (
        <span className="flex size-8 items-center justify-center text-muted-foreground" role="status" aria-label="Saving rating">
          <Loader2 className="size-4 animate-spin" />
        </span>
      ) : null}
      {thumb(true)}
      {thumb(false)}
    </div>
  );
}

/** Experience, place, notice, pay and when the candidate last confirmed their profile. */
export function MatchFacts({ m, className }: { m: MatchItem; className?: string }) {
  const p = m.profile;
  const item = "inline-flex items-center gap-1.5";
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
        {p.experience_years != null && (
          <span className={item}>
            <Briefcase aria-hidden className="size-3.5" />
            <span className="tabular-nums">{p.experience_years} yrs</span>
          </span>
        )}
        {p.city && (
          <span className={item}>
            <MapPin aria-hidden className="size-3.5" />
            {p.city}
          </span>
        )}
        {p.notice_period_days != null && (
          <span className={item}>
            <Clock3 aria-hidden className="size-3.5" />
            <span className="tabular-nums">Notice {p.notice_period_days} days</span>
          </span>
        )}
        {p.expected_ctc != null && (
          <span className={item}>
            <Wallet aria-hidden className="size-3.5" />
            <span className="tabular-nums">Expects {p.expected_ctc} LPA</span>
          </span>
        )}
        <span className={item}>
          <BadgeCheck aria-hidden className="size-3.5" />
          {p.last_verified_at ? `Confirmed ${fmtDate(p.last_verified_at)}` : "Never confirmed by the candidate"}
        </span>
      </div>
      {m.status_reason && m.ai_score == null && (
        <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" />
          Not scored: {m.status_reason.replace(/_/g, " ")} — review by hand.
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</div>;
}

function DimensionBars({ dims }: { dims: Record<string, number> }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-5">
      {Object.entries(DIMENSION_LABELS).map(([k, label]) => (
        <div key={k} title={`${label}: ${dims[k] ?? "—"} / 100`}>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{label}</span>
            <span className="font-medium text-foreground tabular-nums">{dims[k] ?? "—"}</span>
          </div>
          <Progress
            value={Math.min(Math.max(dims[k] ?? 0, 0), 100)}
            aria-label={label}
            className="mt-1.5 h-1.5 bg-brand-50 dark:bg-brand-500/10 [&>[data-slot=progress-indicator]]:bg-brand-500 dark:[&>[data-slot=progress-indicator]]:bg-brand-400"
          />
        </div>
      ))}
    </div>
  );
}

/** The evidence behind a score: dimension bars, must-haves with quotes, gaps, risks, and how it was scored. */
export function MatchDetails({ m, className }: { m: MatchItem; className?: string }) {
  const [open, setOpen] = useState(false);
  const tally = mustHavesMet(m);

  return (
    <div className={cn("space-y-5", className)}>
      {m.dimension_scores && (
        <div className="space-y-2.5">
          <SectionLabel>Fit by dimension</SectionLabel>
          <DimensionBars dims={m.dimension_scores} />
        </div>
      )}

      {m.must_haves && m.must_haves.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>
            Must-haves
            {tally && <span className="ml-1.5 normal-case tracking-normal tabular-nums">· {tally.met} of {tally.total} met</span>}
          </SectionLabel>
          <ul className="space-y-2">
            {m.must_haves.map((h, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <MetIcon met={h.met} className="mt-0.5" />
                <div className="min-w-0">
                  <div className="text-foreground">{h.requirement}</div>
                  {h.evidence && (
                    <div className="mt-0.5 text-muted-foreground">
                      <q className="italic">{h.evidence}</q>
                      {!h.evidence_verified && (
                        <Badge
                          variant="outline"
                          className="ml-1.5 border-amber-200 bg-amber-50 align-middle font-normal text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                        >
                          quote not found in the CV
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {m.gaps?.length || m.risk_flags?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {m.gaps && m.gaps.length > 0 && (
            <div className="space-y-1.5 text-sm">
              <SectionLabel>Gaps</SectionLabel>
              <ul className="list-disc space-y-0.5 pl-5 text-foreground marker:text-muted-foreground">
                {m.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          {m.risk_flags && m.risk_flags.length > 0 && (
            <div className="space-y-1.5 text-sm">
              <SectionLabel>Worth checking</SectionLabel>
              <ul className="space-y-1 text-foreground">
                {m.risk_flags.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      {r.flag}
                      {r.evidence ? <span className="text-muted-foreground"> — “{r.evidence}”</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}

      <div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="-ml-2 h-7 gap-1 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          {open ? "Hide" : "Show"} how this was scored
        </Button>
        {open && (
          <div className="mt-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            {m.strengths && m.strengths.length > 0 && (
              <p className="mb-2">
                <span className="font-medium text-foreground">Strengths:</span> {m.strengths.map((s) => s.strength).join("; ")}
              </p>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
              {(
                [
                  ["Model", m.model],
                  ["Prompt", m.prompt_version],
                  ["Model's own score", m.model_score],
                  ["Vector", m.vector_score],
                  ["Stage 1", m.stage1_score],
                ] as [string, string | number | null][]
              ).map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt>{k}</dt>
                  <dd className="truncate font-mono text-foreground tabular-nums" title={v == null ? undefined : String(v)}>
                    {v ?? "—"}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2">
              Sent to the model (no name, contact, age, gender, religion, caste, address, nationality):{" "}
              <span className="text-foreground">{m.fields_sent?.join(", ") || "—"}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One ranked candidate: score, who they are, the evidence for every
 * requirement, and thumbs for the precision report. Pass `onRated` to keep the
 * rating in the caller (it then reads `m.recruiter_rating`).
 */
export function MatchCard({
  m,
  actions,
  onRated,
}: {
  m: MatchItem;
  actions?: React.ReactNode;
  onRated?: (id: string, rating: MatchRating) => void;
}) {
  const [localRating, setLocalRating] = useState<MatchRating>(m.recruiter_rating);
  const rating = onRated ? m.recruiter_rating : localRating;
  const p = m.profile;

  return (
    <Card role="article" aria-label={p.name || `Profile ${m.profile_id}`} className="gap-0 py-0 shadow-none transition-colors hover:border-foreground/20">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <ScoreTile score={m.ai_score} rank={m.rank} />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-foreground">{p.name || `Profile ${m.profile_id}`}</span>
                <Pill>{p.verification_status}</Pill>
                {m.status !== "ranked" && <Pill>{m.status}</Pill>}
              </div>
              <div className="text-sm text-muted-foreground">{roleLine(p)}</div>
              <MatchFacts m={m} className="pt-0.5" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
            {actions}
            {actions ? <Separator orientation="vertical" className="h-6" /> : null}
            <RatingButtons matchId={m.id} rating={rating} onRated={onRated ?? ((_, r) => setLocalRating(r))} />
          </div>
        </div>
        <Separator className="my-4" />
        <MatchDetails m={m} />
      </CardContent>
    </Card>
  );
}
