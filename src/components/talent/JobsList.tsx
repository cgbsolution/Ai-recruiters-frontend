"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef, SortingFn } from "@tanstack/react-table";
import {
  ArrowUpRight,
  Briefcase,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  CircleX,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { notifyError, notifySuccess } from "@/lib/notify";
import { parseUtc, pct, talentGet, talentPost, type PrecisionReport, type TalentJobRow } from "@/lib/talent";
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
} from "./data-table";
import { Panel, Pill, Stat, TalentShell, useTalentOrg } from "./TalentShell";

/** A /jobs row. The list doesn't send `department` today; it's shown if it ever does. */
type JobRow = TalentJobRow & { department?: string | null };
type PrecisionRow = PrecisionReport["jobs"][number];
type Tone = NonNullable<React.ComponentProps<typeof Pill>["tone"]>;

const jobHref = (ref: string) => `/talent/jobs/${ref}`;
const isMatching = (s: string | null) => s === "queued" || s === "running";

/** Exact-value facet filter (the ColumnFilter sets a string[]). */

/** Sort by a fixed order (unknown values last). */
function byOrder<T>(order: string[]): SortingFn<T> {
  const rank = (v: unknown) => {
    const i = order.indexOf(String(v));
    return i < 0 ? order.length : i;
  };
  return (a, b, id) => rank(a.getValue(id)) - rank(b.getValue(id));
}

// ── Job status ──────────────────────────────────────────────────────────────

const JOB_STATUS: { value: string; tone: Tone }[] = [
  { value: "Open", tone: "green" },
  { value: "Draft", tone: "gray" },
  { value: "Inactive", tone: "amber" },
  { value: "Finished", tone: "blue" },
];
const jobTone = (s: string): Tone => JOB_STATUS.find((o) => o.value === s)?.tone ?? "gray";

// ── Autonomy ────────────────────────────────────────────────────────────────

const AUTONOMY: FilterOption[] = [
  { value: "autopilot", label: "Autopilot", icon: Zap },
  { value: "copilot", label: "Copilot", icon: UserCheck },
  { value: "none", label: "Not set", icon: CircleDashed },
];

function AutonomyPill({ mode }: { mode: string | null }) {
  if (mode === "autopilot")
    return (
      <Pill tone="blue">
        <Zap aria-hidden /> autopilot
      </Pill>
    );
  if (mode === "copilot")
    return (
      <Pill tone="gray">
        <UserCheck aria-hidden /> copilot
      </Pill>
    );
  return <span className="text-sm text-muted-foreground">Not set</span>;
}

// ── Matching run status ─────────────────────────────────────────────────────

const MATCH_RUN: (FilterOption & { tone: Tone; word: string })[] = [
  { value: "running", label: "Running", word: "running", tone: "blue", icon: Loader2 },
  { value: "queued", label: "Queued", word: "queued", tone: "blue", icon: Loader2 },
  { value: "failed", label: "Failed", word: "failed", tone: "red", icon: CircleX },
  { value: "done", label: "Done", word: "done", tone: "green", icon: CircleCheck },
  { value: "skipped", label: "Skipped", word: "skipped", tone: "amber", icon: CircleSlash },
  { value: "never", label: "Never run", word: "never run", tone: "gray", icon: CircleDashed },
];

function MatchRunPill({ status }: { status: string | null }) {
  const key = status ?? "never";
  const o = MATCH_RUN.find((m) => m.value === key);
  const Icon = o?.icon;
  return (
    <Pill tone={o?.tone ?? "gray"}>
      {Icon && <Icon aria-hidden className={cn(isMatching(key) && "animate-spin")} />}
      {o?.word ?? key.replace(/_/g, " ")}
    </Pill>
  );
}

// ── Match counts ────────────────────────────────────────────────────────────

/** Where candidates are now, grouped for the row; the tooltip has every status. */
const BUCKETS: { label: string; statuses: string[]; className: string }[] = [
  { label: "ranked", statuses: ["ranked", "needs_refresh"], className: "" },
  {
    label: "awaiting approval",
    statuses: ["approval_pending"],
    className: "border-transparent bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  {
    label: "invited",
    statuses: ["invited", "scheduled"],
    className: "border-transparent bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  },
  {
    label: "interviewed",
    statuses: ["interviewed", "shortlisted", "submitted", "offered"],
    className: "border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
];

const PIPELINE = [
  "ranked", "needs_refresh", "approval_pending", "invited", "declined", "scheduled",
  "interviewed", "shortlisted", "submitted", "offered", "closed",
];

const matchTotal = (j: JobRow) => Object.values(j.matches ?? {}).reduce((a, b) => a + b, 0);

function MatchCounts({ matches }: { matches: Record<string, number> }) {
  const total = Object.values(matches ?? {}).reduce((a, b) => a + b, 0);
  if (!total) return <span className="text-sm text-muted-foreground">None yet</span>;
  const breakdown = Object.entries(matches)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => {
      const ia = PIPELINE.indexOf(a);
      const ib = PIPELINE.indexOf(b);
      return (ia < 0 ? PIPELINE.length : ia) - (ib < 0 ? PIPELINE.length : ib);
    });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          className="flex max-w-72 flex-wrap items-center gap-1 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="mr-1 font-semibold tabular-nums text-foreground">{total}</span>
          {BUCKETS.map((b) => {
            const n = b.statuses.reduce((a, s) => a + (matches[s] ?? 0), 0);
            if (!n) return null;
            return (
              <Badge key={b.label} variant="secondary" className={cn("font-normal", b.className)}>
                <span className="font-semibold tabular-nums">{n}</span> {b.label}
              </Badge>
            );
          })}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-xs">
          {breakdown.map(([s, n]) => (
            <React.Fragment key={s}>
              <dt>{s.replace(/_/g, " ")}</dt>
              <dd className="text-right tabular-nums">{n}</dd>
            </React.Fragment>
          ))}
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function JobsBody() {
  const { orgId } = useTalentOrg();
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [precision, setPrecision] = useState<PrecisionReport | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState<number | null>(null);
  // Only the newest response lands (an org switch or a poll can overlap).
  const seq = useRef(0);

  const loadJobs = useCallback(async (quiet = false) => {
    const n = ++seq.current;
    try {
      const rows = await talentGet<JobRow[]>("/jobs");
      if (n === seq.current) setJobs(rows);
    } catch (e) {
      if (n !== seq.current) return;
      setJobs((j) => j ?? []);
      if (!quiet) notifyError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let live = true;
    setJobs(null);
    setPrecision(null);
    loadJobs();
    talentGet<PrecisionReport>("/reports/precision")
      .then((p) => live && setPrecision(p))
      .catch((e) => live && notifyError((e as Error).message));
    return () => {
      live = false;
    };
  }, [orgId, loadJobs]);

  // While any job is matching, poll so its status (and counts) move on their own.
  const active = !!jobs?.some((j) => isMatching(j.match_status));
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => loadJobs(true), 5000);
    return () => clearInterval(t);
  }, [active, loadJobs]);

  const refresh = async () => {
    setRefreshing(true);
    await loadJobs();
    setRefreshing(false);
  };

  const run = useCallback(
    async (job: JobRow) => {
      setStarting(job.id);
      try {
        await talentPost(`/jobs/${job.ref}/match`, {});
        setJobs((rows) => rows && rows.map((r) => (r.id === job.id ? { ...r, match_status: "queued" } : r)));
        notifySuccess(`Matching queued for ${job.title}`);
      } catch (e) {
        notifyError((e as Error).message); // e.g. match loop off, job not open, worker unreachable
      } finally {
        setStarting(null);
        loadJobs(true);
      }
    },
    [loadJobs],
  );

  const statusOptions = useMemo<FilterOption[]>(() => {
    const known = JOB_STATUS.map((s) => s.value);
    const extra = [...new Set((jobs ?? []).map((j) => j.status))].filter((s) => !known.includes(s)).sort();
    return [...known, ...extra].map((s) => ({ value: s, label: s }));
  }, [jobs]);

  const columns = useMemo<ColumnDef<JobRow, unknown>[]>(
    () => [
      {
        id: "job",
        accessorFn: (r) => [r.title, r.location, r.department].filter(Boolean).join(" · "),
        meta: { label: "Job" },
        enableHiding: false,
        sortingFn: "text",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Job" />,
        cell: ({ row }) => {
          const j = row.original;
          return (
            <Link
              href={jobHref(j.ref)}
              title={j.title}
              className="block max-w-72 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 hover:[&_.font-medium]:underline"
            >
              <Person
                name={j.title}
                icon={Briefcase}
                seed={j.id}
                sub={[j.location, j.department].filter(Boolean).join(" · ") || "No location"}
              />
            </Link>
          );
        },
      },
      {
        accessorKey: "status",
        meta: { label: "Status" },
        enableGlobalFilter: false,
        filterFn: "oneOf",
        sortingFn: byOrder(JOB_STATUS.map((s) => s.value)),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <Pill tone={jobTone(row.original.status)}>{row.original.status}</Pill>,
      },
      {
        id: "autonomy",
        accessorFn: (r) => r.autonomy_mode ?? "none",
        meta: { label: "Autonomy" },
        enableGlobalFilter: false,
        filterFn: "oneOf",
        sortingFn: byOrder(AUTONOMY.map((a) => a.value)),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Autonomy" />,
        cell: ({ row }) => <AutonomyPill mode={row.original.autonomy_mode} />,
      },
      {
        id: "match_status",
        accessorFn: (r) => r.match_status ?? "never",
        meta: { label: "Matching" },
        enableGlobalFilter: false,
        filterFn: "oneOf",
        sortingFn: byOrder(MATCH_RUN.map((m) => m.value)),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Matching" />,
        cell: ({ row }) => <MatchRunPill status={row.original.match_status} />,
      },
      {
        id: "matches",
        accessorFn: matchTotal,
        meta: { label: "Matches" },
        enableGlobalFilter: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Matches" />,
        cell: ({ row }) => <MatchCounts matches={row.original.matches} />,
      },
      {
        id: "last_matched",
        accessorFn: (r) => (r.last_matched_at ? parseUtc(r.last_matched_at).getTime() : undefined),
        meta: { label: "Last matched" },
        enableGlobalFilter: false,
        sortUndefined: "last",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Last matched" />,
        cell: ({ row }) =>
          row.original.last_matched_at ? (
            <RelativeTime iso={row.original.last_matched_at} className="text-muted-foreground" />
          ) : (
            <span className="text-muted-foreground">Never</span>
          ),
      },
      {
        id: "actions",
        size: 48,
        enableSorting: false,
        enableHiding: false,
        enableGlobalFilter: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const j = row.original;
          const busy = isMatching(j.match_status) || starting === j.id;
          return (
            <RowActions
              actions={[
                { label: "Open job", icon: ArrowUpRight, onSelect: () => router.push(jobHref(j.ref)) },
                {
                  label: busy ? "Matching…" : "Run matching",
                  icon: busy ? Loader2 : Play,
                  disabled: busy,
                  onSelect: () => run(j),
                },
              ]}
            />
          );
        },
      },
    ],
    [router, run, starting],
  );

  const precisionColumns = useMemo<ColumnDef<PrecisionRow, unknown>[]>(
    () => [
      {
        accessorKey: "title",
        meta: { label: "Job" },
        sortingFn: "text",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Job" />,
        cell: ({ row }) => (
          <Link
            href={jobHref(row.original.ref)}
            className="font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline"
          >
            {row.original.title || `Job ${row.original.job_id}`}
          </Link>
        ),
      },
      {
        accessorKey: "rated_in_top_10",
        meta: { label: "Rated in top 10" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Rated" align="right" />,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {row.original.rated_in_top_10}
            <span className="text-muted-foreground"> / 10</span>
          </div>
        ),
      },
      {
        accessorKey: "relevant_in_top_10",
        meta: { label: "Relevant" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Relevant" align="right" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{row.original.relevant_in_top_10}</div>,
      },
      {
        id: "precision",
        accessorFn: (r) => r.precision_at_10 ?? undefined,
        meta: { label: "Precision@10" },
        sortUndefined: "last",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Precision@10" />,
        cell: ({ row }) => {
          const r = row.original;
          if (r.precision_at_10 != null) return <ScoreBar value={Math.round(r.precision_at_10 * 100)} suffix="%" />;
          const left = Math.max(0, 10 - r.rated_in_top_10);
          return (
            <span className="text-xs text-muted-foreground">
              {left} more to rate
              {r.precision_of_rated != null ? ` · ${pct(r.precision_of_rated, 0)} of rated so far` : ""}
            </span>
          );
        },
      },
    ],
    [],
  );

  const filteredEmpty = (
    <EmptyState icon={Search} title="No jobs match" description="Try another search, or clear a filter with Reset." />
  );
  const noJobs = (
    <EmptyState
      icon={Briefcase}
      title="No jobs yet"
      description="Jobs you open appear here, and the agent ranks candidates for each one."
      action={
        <Button asChild variant="outline" className="h-8">
          <Link href="/create-openings">
            <Plus /> Create an opening
          </Link>
        </Button>
      }
    />
  );

  const precisionRows = precision?.jobs ?? [];

  return (
    <div className="space-y-6">
      <Panel title="Jobs" description="Matching runs when a job is created or changed while the match loop is on, or when you ask.">
        <DataTable
          storageKey="jobs"
          columns={columns}
          data={jobs}
          getRowId={(r) => String(r.id)}
          onRowClick={(r) => router.push(jobHref(r.ref))}
          initialSorting={[
            { id: "status", desc: false },
            { id: "last_matched", desc: true },
          ]}
          empty={jobs?.length ? filteredEmpty : noJobs}
          toolbar={(table) => (
            <Toolbar
              table={table}
              actions={
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      aria-label="Refresh jobs"
                      disabled={refreshing}
                      onClick={refresh}
                    >
                      <RefreshCw className={cn(refreshing && "animate-spin")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh</TooltipContent>
                </Tooltip>
              }
            >
              <SearchBox
                value={String(table.getState().globalFilter ?? "")}
                onChange={(v) => table.setGlobalFilter(v)}
                placeholder="Search title or location…"
              />
              <ColumnFilter column={table.getColumn("status")} title="Status" options={statusOptions} />
              <ColumnFilter column={table.getColumn("autonomy")} title="Autonomy" options={AUTONOMY} />
              <ColumnFilter column={table.getColumn("match_status")} title="Matching" options={MATCH_RUN} />
            </Toolbar>
          )}
        />
      </Panel>

      <Panel
        title="Ranking quality"
        description="Rate the top 10 matches of a job as relevant or not; precision@10 is the share of the top 10 a recruiter judged relevant."
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat
            label="Mean precision@10"
            value={precision?.mean_precision_at_10 != null ? pct(precision.mean_precision_at_10, 0) : "—"}
            hint={`${precision?.jobs_fully_rated ?? 0} job${precision?.jobs_fully_rated === 1 ? "" : "s"} fully rated`}
          />
          <Stat label="Jobs with ratings" value={precision?.jobs.length ?? 0} />
        </div>
        {precisionRows.length > 0 && (
          <DataTable
            className="mt-4"
            columns={precisionColumns}
            data={precisionRows}
            getRowId={(r) => String(r.job_id)}
            initialSorting={[{ id: "title", desc: false }]}
            pageSize={10}
            noPagination={precisionRows.length <= 10}
          />
        )}
      </Panel>
    </div>
  );
}

export default function JobsList() {
  return (
    <TalentShell title="Job matches" subtitle="Ranked candidates for each opening — the AI orders the list; you decide.">
      <JobsBody />
    </TalentShell>
  );
}
