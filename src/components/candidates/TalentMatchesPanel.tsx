"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, ChevronDown, ChevronUp, ExternalLink, MailCheck, MailX } from "lucide-react";
import { talentGet, type MatchItem } from "@/lib/talent";

/**
 * The Talent Agent's ranked matches for this job, read-only. They aren't job
 * applications (they never applied), so they're listed here rather than added
 * to the candidates table; inviting, consent and decisions happen on the
 * Talent Agent's job page. Hidden when the agent has nothing for this job or
 * the user can't see it.
 */

const COLLAPSED = 5;

const STATUS_LABEL: Record<string, string> = {
  ranked: "Ranked",
  needs_refresh: "Needs refresh",
  approval_pending: "Awaiting approval",
  invited: "Invited",
  scheduled: "Interview booked",
  interviewed: "Interviewed",
  shortlisted: "Shortlisted",
  submitted: "Submitted",
  declined: "Not interested",
  closed: "Closed",
};

function scoreColor(score: number) {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-blue-500";
  return "bg-amber-500";
}

export default function TalentMatchesPanel({ jobId }: { jobId: string }) {
  const [items, setItems] = useState<MatchItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    let live = true;
    talentGet<{ total: number; items: MatchItem[] }>(`/jobs/${jobId}/matches?limit=25`)
      .then((r) => {
        if (!live) return;
        setItems(r.items.filter((m) => m.ai_score != null));
        setTotal(r.total);
      })
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [jobId]);

  if (!items || items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, COLLAPSED);
  const href = `/talent/jobs/${jobId}`;

  return (
    <div className="rounded-lg border border-violet-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-violet-100 bg-violet-50/60 px-4 py-3">
        <Bot className="h-5 w-5 flex-shrink-0 text-violet-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">Talent Agent · top matches</p>
          <p className="text-xs text-gray-600">
            {total} ranked from the resume database. They haven’t applied — invite them from the Talent Agent.
          </p>
        </div>
        <Link
          href={href}
          className="inline-flex flex-shrink-0 items-center gap-1 text-sm font-medium text-violet-700 hover:underline"
        >
          Open in Talent Agent <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <ul className="divide-y divide-gray-100">
        {shown.map((m) => {
          const score = Math.round(m.ai_score ?? 0);
          const p = m.profile;
          const role = [p.current_designation, p.current_company].filter(Boolean).join(" at ");
          return (
            <li key={m.id}>
              <Link href={href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                <span className="w-6 flex-shrink-0 text-right text-xs tabular-nums text-gray-400">#{m.rank}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{p.name || `Profile #${m.profile_id}`}</p>
                  {role && <p className="truncate text-xs text-gray-500">{role}</p>}
                </div>
                <div className="hidden w-28 flex-shrink-0 items-center gap-2 sm:flex">
                  <span className="w-7 text-right text-sm font-semibold tabular-nums text-gray-900">{score}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-gray-100">
                    <span className={`block h-1.5 rounded-full ${scoreColor(score)}`} style={{ width: `${score}%` }} />
                  </span>
                </div>
                <span className="w-8 text-right text-sm font-semibold tabular-nums text-gray-900 sm:hidden">{score}</span>
                <span className="hidden flex-shrink-0 rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600 md:inline">
                  {STATUS_LABEL[m.status] ?? m.status.replace(/_/g, " ")}
                </span>
                {m.contact &&
                  (m.contact.allowed ? (
                    <MailCheck className="h-4 w-4 flex-shrink-0 text-emerald-600" aria-label="Can email" />
                  ) : (
                    <MailX className="h-4 w-4 flex-shrink-0 text-amber-600" aria-label="Can't email" />
                  ))}
              </Link>
            </li>
          );
        })}
      </ul>

      {items.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-gray-100 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          {expanded ? (
            <>
              Show fewer <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Show all {items.length} <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
