"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowRight,
  Ban,
  BellRing,
  Briefcase,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CirclePlay,
  ClipboardCheck,
  Hand,
  History,
  Hourglass,
  RefreshCw,
  Search,
  Send,
  Star,
  TimerOff,
  UserX,
  Video,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { notifyError, notifySuccess } from "@/lib/notify";
import { fmtDate, parseUtc, talentGet, talentPost, type InterviewRow } from "@/lib/talent";
import { cn } from "@/lib/utils";
import {
  ColumnFilter,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  Person,
  RelativeTime,
  RowActions,
  ScoreBar,
  SearchBox,
  Toolbar,
  type FilterOption,
  type RowAction,
} from "./data-table";
import { Panel, Pill, Stat, TalentShell, useTalentOrg } from "./TalentShell";

type Icon = React.ComponentType<{ className?: string }>;

/** Statuses whose transcript and scores can be opened. */
const REVIEWABLE = ["completed", "scored"];
/** Statuses a recruiter can re-offer times for (when the interview is flagged). */
const REOFFERABLE = ["no_show", "expired", "human_requested", "offered", "scheduled"];
const UPCOMING = ["offered", "scheduled", "in_progress"];

const MODE_LABELS: Record<string, string> = {
  async_text: "Async text",
  async_voice: "Async voice",
  live_voice: "Live voice",
};
const modeLabel = (mode: string) => MODE_LABELS[mode] ?? mode.replace(/_/g, " ");

/** Filter labels and icons, in pipeline order. */
const STATUS_META: Record<string, { label: string; icon: Icon }> = {
  offered: { label: "Offered", icon: Send },
  scheduled: { label: "Scheduled", icon: CalendarClock },
  in_progress: { label: "In progress", icon: CirclePlay },
  completed: { label: "Completed", icon: CircleCheck },
  scored: { label: "Scored", icon: Star },
  no_show: { label: "No show", icon: UserX },
  human_requested: { label: "Asked for a person", icon: Hand },
  expired: { label: "Expired", icon: TimerOff },
  cancelled: { label: "Cancelled", icon: Ban },
};
const STATUS_ORDER = Object.keys(STATUS_META);

const REVIEW_OPTIONS: FilterOption[] = [
  { value: "pending", label: "Awaiting review", icon: Hourglass },
  { value: "reviewed", label: "Reviewed", icon: ClipboardCheck },
  { value: "none", label: "Not scored yet", icon: CircleDashed },
];

const reviewHref = (r: InterviewRow) => `/talent/interviews/${r.id}`;
const canReview = (r: InterviewRow) => REVIEWABLE.includes(r.status);
const canReoffer = (r: InterviewRow) => r.needs_recruiter && REOFFERABLE.includes(r.status);

function whenOf(r: InterviewRow): { iso: string | null; label: string } {
  if (r.completed_at) return { iso: r.completed_at, label: "completed" };
  if (r.scheduled_at) return { iso: r.scheduled_at, label: "scheduled" };
  return { iso: null, label: "" };
}

/** Why the agent handed this interview to a person, read from its state. */
function flagReason(r: InterviewRow): string {
  switch (r.status) {
    case "human_requested":
      return "The candidate asked to speak to a person instead of the AI.";
    case "no_show":
      return `The candidate missed the interview ${r.no_show_count > 1 ? `${r.no_show_count} times` : "again"}; the agent only re-offers once.`;
    case "expired":
      return "The candidate didn't pick a time before the offer ran out.";
    case "offered":
      return "No free calendar time was left to offer the candidate.";
    case "scheduled":
      return "The candidate asked to reschedule again; the agent only moves an interview once.";
    default:
      return "The agent needs a person to decide the next step.";
  }
}

function ReviewPill({ value }: { value: string | null }) {
  if (value === "pending") return <Pill tone="amber">awaiting review</Pill>;
  if (value === "reviewed") return <Pill tone="green">reviewed</Pill>;
  if (value) return <Pill>{value}</Pill>;
  return <span className="text-muted-foreground">—</span>;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** The row's expanded detail: why it's flagged, and the scheduling history. */
function InterviewDetails({ r }: { r: InterviewRow }) {
  return (
    <div className="space-y-4">
      {r.needs_recruiter && (
        <Alert variant="warning">
          <BellRing />
          <AlertTitle>Needs you</AlertTitle>
          <AlertDescription>{flagReason(r)}</AlertDescription>
        </Alert>
      )}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        <Fact label="Format">{modeLabel(r.mode)}</Fact>
        <Fact label="Scheduled for">
          <span className="tabular-nums">{fmtDate(r.scheduled_at, true)}</span>
        </Fact>
        <Fact label="Completed">
          <span className="tabular-nums">{fmtDate(r.completed_at, true)}</span>
        </Fact>
        <Fact label="Reschedules">
          <span className="tabular-nums">{r.reschedule_count}</span>
        </Fact>
        <Fact label="No-shows">
          <span className="tabular-nums">{r.no_show_count}</span>
        </Fact>
        <Fact label="Process">
          <Pill>{r.match_status}</Pill>
        </Fact>
      </dl>
    </div>
  );
}

function InterviewsBody() {
  const { orgId } = useTalentOrg();
  const router = useRouter();
  const [rows, setRows] = useState<InterviewRow[] | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    talentGet<InterviewRow[]>(`/interviews${onlyFlagged ? "?needs_recruiter=true" : ""}`)
      .then(setRows)
      .catch((e) => notifyError(e.message))
      .finally(() => setLoading(false));
  }, [onlyFlagged]);

  useEffect(load, [load, orgId]);

  const toggleFlagged = (on: boolean) => {
    if (on === onlyFlagged) return;
    setRows(null); // a different list: show the skeleton, not the old rows
    setOnlyFlagged(on);
  };

  const reoffer = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        await talentPost(`/interviews/${id}/reschedule`, {});
        notifySuccess("New times offered to the candidate");
        load();
      } catch (e) {
        notifyError((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const stats = useMemo(() => {
    if (!rows) return null;
    return {
      flagged: rows.filter((r) => r.needs_recruiter).length,
      upcoming: rows.filter((r) => UPCOMING.includes(r.status)).length,
      pending: rows.filter((r) => r.human_review_status === "pending").length,
      reviewed: rows.filter((r) => r.human_review_status === "reviewed").length,
    };
  }, [rows]);

  const statusOptions = useMemo<FilterOption[]>(() => {
    const present = [...new Set((rows ?? []).map((r) => r.status))];
    present.sort((a, b) => {
      const ia = STATUS_ORDER.indexOf(a);
      const ib = STATUS_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    return present.map((s) => ({
      value: s,
      label: STATUS_META[s]?.label ?? s.replace(/_/g, " "),
      icon: STATUS_META[s]?.icon,
    }));
  }, [rows]);

  const jobOptions = useMemo<FilterOption[]>(
    () =>
      [...new Set((rows ?? []).map((r) => r.job_title))]
        .sort((a, b) => a.localeCompare(b))
        .map((t) => ({ value: t, label: t, icon: Briefcase })),
    [rows],
  );

  const columns = useMemo<ColumnDef<InterviewRow, unknown>[]>(
    () => [
      {
        id: "expand",
        size: 32,
        enableHiding: false,
        enableSorting: false,
        header: () => <span className="sr-only">Details</span>,
        cell: ({ row }) => (
          <ChevronRight
            aria-hidden
            className={cn("size-4 text-muted-foreground transition-transform", row.getIsExpanded() && "rotate-90")}
          />
        ),
      },
      {
        id: "candidate",
        accessorFn: (r) => r.candidate ?? `Profile #${r.profile_id}`,
        meta: { label: "Candidate" },
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Candidate" />,
        cell: ({ row }) => {
          const r = row.original;
          const person = (
            <Person name={r.candidate ?? `Profile #${r.profile_id}`} sub={`${modeLabel(r.mode)} interview`} seed={r.profile_id} />
          );
          return canReview(r) ? (
            <Link
              href={reviewHref(r)}
              className="block max-w-64 rounded-md outline-none hover:[&_.font-medium]:underline hover:[&_.font-medium]:underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {person}
            </Link>
          ) : (
            <div className="max-w-64">{person}</div>
          );
        },
      },
      {
        id: "job",
        accessorKey: "job_title",
        meta: { label: "Job" },
        filterFn: "oneOf",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Job" />,
        cell: ({ row }) => (
          <Link
            href={`/talent/jobs/${row.original.job_ref}`}
            className="block max-w-56 truncate text-foreground underline-offset-4 hover:underline"
          >
            {row.original.job_title}
          </Link>
        ),
      },
      {
        id: "when",
        accessorFn: (r) => {
          const iso = r.completed_at ?? r.scheduled_at;
          return iso ? parseUtc(iso).getTime() : undefined;
        },
        sortUndefined: "last",
        enableGlobalFilter: false,
        meta: { label: "When" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
        cell: ({ row }) => {
          const w = whenOf(row.original);
          if (!w.iso) return <span className="text-muted-foreground">Not booked</span>;
          return (
            <div className="flex flex-col">
              <RelativeTime iso={w.iso} />
              <span className="text-xs text-muted-foreground">{w.label}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        meta: { label: "Status" },
        filterFn: "oneOf",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <Pill>{row.original.status}</Pill>
            {row.original.needs_recruiter && <Pill tone="amber">needs you</Pill>}
          </div>
        ),
      },
      {
        id: "score",
        accessorFn: (r) => r.overall_score ?? undefined,
        sortUndefined: "last",
        enableGlobalFilter: false,
        meta: { label: "Interview score" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Score" />,
        cell: ({ row }) => <ScoreBar value={row.original.overall_score} max={5} />,
      },
      {
        id: "match",
        accessorFn: (r) => r.ai_score ?? undefined,
        sortUndefined: "last",
        enableGlobalFilter: false,
        meta: { label: "Match score" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Match" />,
        cell: ({ row }) => <ScoreBar value={row.original.ai_score} max={100} />,
      },
      {
        id: "review",
        accessorFn: (r) => r.human_review_status ?? "none",
        meta: { label: "Review" },
        filterFn: "oneOf",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Review" />,
        cell: ({ row }) => <ReviewPill value={row.original.human_review_status} />,
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const r = row.original;
          const reviewable = canReview(r);
          const reofferable = canReoffer(r);
          const actions: RowAction[] = [];
          if (reviewable) actions.push({ label: "Open review", icon: ClipboardCheck, onSelect: () => router.push(reviewHref(r)) });
          if (reofferable) {
            actions.push({ label: "Offer new times", icon: RefreshCw, onSelect: () => reoffer(r.id), disabled: busy === r.id });
          }
          actions.push(
            {
              label: "View job",
              icon: Briefcase,
              onSelect: () => router.push(`/talent/jobs/${r.job_ref}`),
              separatorBefore: actions.length > 0,
            },
            { label: "Audit trail", icon: History, onSelect: () => router.push(`/talent/audit?profile_id=${r.profile_id}`) },
          );
          return (
            <div className="flex items-center justify-end gap-1">
              {reviewable && (
                <Button asChild variant="outline" className="h-8 px-2.5">
                  <Link href={reviewHref(r)}>
                    {r.human_review_status === "pending" ? "Review" : "Open"} <ArrowRight />
                  </Link>
                </Button>
              )}
              {reofferable && (
                <Button variant="outline" className="h-8 px-2.5" disabled={busy === r.id} onClick={() => reoffer(r.id)}>
                  <RefreshCw className={cn(busy === r.id && "animate-spin")} /> Offer new times
                </Button>
              )}
              <RowActions actions={actions} label="Interview actions" />
            </div>
          );
        },
      },
    ],
    [router, reoffer, busy],
  );

  const statValue = (n: number | undefined) =>
    n == null ? <Skeleton className="h-8 w-10" /> : <span className="tabular-nums">{n}</span>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Needs you"
          value={statValue(stats?.flagged)}
          hint="Re-offers, no-shows, requests"
          tone={stats?.flagged ? "warn" : undefined}
        />
        <Stat label="Upcoming" value={statValue(stats?.upcoming)} hint="Offered, booked or under way" />
        <Stat
          label="Awaiting review"
          value={statValue(stats?.pending)}
          hint="Scored, not yet reviewed"
          tone={stats?.pending ? "warn" : undefined}
        />
        <Stat
          label="Reviewed"
          value={statValue(stats?.reviewed)}
          hint="Checked by a recruiter"
          tone={stats?.reviewed ? "good" : undefined}
        />
      </div>

      <Panel
        title="Interviews"
        description="AI interviews the agent has scheduled. Flagged ones need you: a second reschedule, a second no-show, no free calendar time, or the candidate asked for a person. Click a row for its history."
      >
        <DataTable
          storageKey="interviews"
          columns={columns}
          data={rows}
          rowClassName={(r) => (r.needs_recruiter ? "bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-500/5 dark:hover:bg-amber-500/10" : undefined)}
          getRowId={(r) => r.id}
          initialSorting={[{ id: "when", desc: true }]}
          initialHidden={["match"]}
          renderExpanded={(r) => <InterviewDetails r={r} />}
          empty={
            rows && rows.length > 0 ? (
              <EmptyState icon={Search} title="No interviews match" description="Try another search, or clear a filter." />
            ) : onlyFlagged ? (
              <EmptyState
                icon={CircleCheck}
                title="Nothing needs you right now"
                description="Interviews the agent hands back to you show up here."
                action={
                  <Button variant="outline" className="h-8" onClick={() => toggleFlagged(false)}>
                    Show all interviews
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Video}
                title="No interviews yet"
                description="When a candidate accepts an invite, the agent offers interview times and the interview appears here."
              />
            )
          }
          toolbar={(table) => {
            const state = table.getState();
            const filtered = onlyFlagged || state.columnFilters.length > 0 || !!state.globalFilter;
            return (
              <Toolbar
                table={table}
                filtered={filtered}
                onReset={() => toggleFlagged(false)}
                actions={
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label="Refresh"
                    title="Refresh"
                    disabled={loading}
                    onClick={() => load()}
                  >
                    <RefreshCw className={cn(loading && "animate-spin")} />
                  </Button>
                }
              >
                <SearchBox
                  value={(state.globalFilter as string | undefined) ?? ""}
                  onChange={(v) => table.setGlobalFilter(v)}
                  placeholder="Search candidate or job…"
                />
                <Button
                  variant={onlyFlagged ? "secondary" : "outline"}
                  className={cn("h-8 px-2.5", !onlyFlagged && "border-dashed")}
                  aria-pressed={onlyFlagged}
                  onClick={() => toggleFlagged(!onlyFlagged)}
                >
                  <BellRing />
                  Needs me
                  {!onlyFlagged && !!stats?.flagged && (
                    <Badge
                      variant="secondary"
                      className="rounded-sm border-transparent bg-amber-50 px-1 font-normal tabular-nums text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    >
                      {stats.flagged}
                    </Badge>
                  )}
                </Button>
                <ColumnFilter column={table.getColumn("status")} title="Status" options={statusOptions} />
                <ColumnFilter column={table.getColumn("review")} title="Review" options={REVIEW_OPTIONS} />
                {jobOptions.length > 1 && <ColumnFilter column={table.getColumn("job")} title="Job" options={jobOptions} />}
              </Toolbar>
            );
          }}
        />
      </Panel>
    </div>
  );
}

export default function InterviewsList() {
  return (
    <TalentShell title="Interviews" subtitle="Scheduling, no-shows and reviews.">
      <InterviewsBody />
    </TalentShell>
  );
}
