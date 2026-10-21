"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, ExternalLink, MailCheck, MailX } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { talentGet, type MatchItem } from "@/lib/talent";

/**
 * The Talent Agent's ranked matches for a job, shown alongside the job's
 * candidates. They aren't job applications (they never applied), so they're
 * read-only here: the main product's email / WhatsApp / promote actions don't
 * check the agent's consent gate, and inviting happens in the Talent Agent.
 * Anyone who is already a candidate on the job is left out, so nobody shows twice.
 */

const MATCH_STATUS: Record<string, string> = {
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

const INTERVIEW_STATUS: Record<string, string> = {
  offered: "Picking a time",
  scheduled: "Interview booked",
  in_progress: "Interviewing",
  completed: "Interviewed",
  no_show: "Missed interview",
  expired: "Didn’t book",
  human_requested: "Asked for a person",
};

export function matchStatusLabel(m: MatchItem) {
  const iv = m.interview?.status;
  if (iv && INTERVIEW_STATUS[iv] && !["declined", "closed", "shortlisted", "submitted"].includes(m.status)) {
    return INTERVIEW_STATUS[iv];
  }
  if (m.status === "invited" && m.contact?.can_ask) return "Consent requested";
  return MATCH_STATUS[m.status] ?? m.status.replace(/_/g, " ");
}

/** The API sends naive UTC datetimes. */
function asDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
}

export function useTalentMatches(jobId: string, excludeProfileIds: Set<number>) {
  const [items, setItems] = useState<MatchItem[]>([]);

  useEffect(() => {
    if (!jobId) return;
    let live = true;
    talentGet<{ items: MatchItem[] }>(`/jobs/${jobId}/matches?limit=25`)
      .then((r) => live && setItems(r.items.filter((m) => m.ai_score != null)))
      .catch(() => live && setItems([])); // agent off or no access: show nothing
    return () => {
      live = false;
    };
  }, [jobId]);

  return items.filter((m) => !excludeProfileIds.has(m.profile_id));
}

function AgentBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
      <Bot className="h-3 w-3" /> Talent Agent
    </span>
  );
}

function ContactIcon({ m }: { m: MatchItem }) {
  if (!m.contact) return null;
  return m.contact.allowed ? (
    <MailCheck className="h-4 w-4 text-emerald-600" aria-label="Can email" />
  ) : (
    <MailX className="h-4 w-4 text-amber-600" aria-label={`Can't email: ${m.contact.reason ?? ""}`} />
  );
}

const dash = <span className="text-gray-400">—</span>;

/**
 * Rows for the candidates table's "Candidates" tab, laid out on its 17 columns:
 * select, AI-cheating, promote, interview date, name, score, trust, fit,
 * interview status, report, resume, schedule, recording, duration, added by,
 * mail history, actions.
 */
export function TalentMatchRows({ matches, jobId }: { matches: MatchItem[]; jobId: string }) {
  if (matches.length === 0) return null;
  const href = `/talent/jobs/${jobId}`;
  return (
    <>
      <TableRow className="bg-violet-50/60 hover:bg-violet-50/60">
        <TableCell colSpan={17} className="px-3 py-2">
          <div className="sticky left-3 flex w-fit items-center gap-2 text-xs text-violet-800">
            <Bot className="h-4 w-4" />
            <span className="font-semibold">Talent Agent matches · {matches.length}</span>
            <span className="text-violet-700/80">
              Ranked from the resume database; they haven’t applied. Invite them from the Talent Agent.
            </span>
            <Link href={href} className="inline-flex items-center gap-1 font-medium text-violet-700 hover:underline">
              Open <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </TableCell>
      </TableRow>
      {matches.map((m) => {
        const p = m.profile;
        const when = asDate(m.interview?.scheduled_at);
        const role = [p.current_designation, p.current_company].filter(Boolean).join(" at ");
        return (
          <TableRow key={`agent-${m.id}`} className="bg-violet-50/20">
            <TableCell className="px-3" />
            <TableCell className="px-3">{dash}</TableCell>
            <TableCell className="px-3">
              <span className="text-xs text-gray-400" title="Not an applicant yet: manage in the Talent Agent">
                —
              </span>
            </TableCell>
            <TableCell className="px-3 whitespace-nowrap text-gray-600">
              {when ? when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : dash}
            </TableCell>
            <TableCell className="px-3">
              <div className="min-w-[160px]">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-gray-800">{p.name || `Profile #${m.profile_id}`}</p>
                  <AgentBadge />
                </div>
                {role && <p className="max-w-[260px] truncate text-xs text-gray-500">{role}</p>}
                <p className="text-xs text-gray-400">Rank #{m.rank}</p>
              </div>
            </TableCell>
            <TableCell className="px-3">{dash}</TableCell>
            <TableCell className="px-3">{dash}</TableCell>
            <TableCell className="px-3">
              <span className="text-sm font-semibold tabular-nums text-gray-800" title="Talent Agent AI score">
                {Math.round(m.ai_score ?? 0)}
              </span>
            </TableCell>
            <TableCell className="px-3">
              <span className="whitespace-nowrap rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-700">
                {matchStatusLabel(m)}
              </span>
            </TableCell>
            <TableCell className="px-3">
              <Link href={href} className="whitespace-nowrap text-xs font-medium text-violet-700 hover:underline">
                View in Talent Agent
              </Link>
            </TableCell>
            <TableCell className="px-3">{dash}</TableCell>
            <TableCell className="px-3 whitespace-nowrap text-xs text-gray-600">
              {when ? when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : dash}
            </TableCell>
            <TableCell className="px-3">{dash}</TableCell>
            <TableCell className="px-3">{dash}</TableCell>
            <TableCell className="px-3 whitespace-nowrap text-xs text-gray-600">Talent Agent</TableCell>
            <TableCell className="px-3">
              <ContactIcon m={m} />
            </TableCell>
            <TableCell className="px-3" />
          </TableRow>
        );
      })}
    </>
  );
}

/** The same matches as cards, for the grid view. */
export function TalentMatchCards({ matches, jobId }: { matches: MatchItem[]; jobId: string }) {
  if (matches.length === 0) return null;
  const href = `/talent/jobs/${jobId}`;
  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-violet-800">
        <Bot className="h-4 w-4" />
        <span className="font-semibold">Talent Agent matches · {matches.length}</span>
        <span className="text-xs text-violet-700/80">They haven’t applied. Invite them from the Talent Agent.</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((m) => {
          const p = m.profile;
          const role = [p.current_designation, p.current_company].filter(Boolean).join(" at ");
          return (
            <Link
              key={`agent-${m.id}`}
              href={href}
              className="rounded-2xl border border-violet-200 bg-violet-50/30 p-4 transition-colors hover:bg-violet-50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{p.name || `Profile #${m.profile_id}`}</p>
                  {role && <p className="truncate text-xs text-gray-500">{role}</p>}
                </div>
                <span className="text-lg font-semibold tabular-nums text-gray-900">{Math.round(m.ai_score ?? 0)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <AgentBadge />
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700">
                    {matchStatusLabel(m)}
                  </span>
                  <ContactIcon m={m} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
