"use client";

import React, { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, ChevronRight, Loader2, Search, TriangleAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { notifyError, notifySuccess } from "@/lib/notify";
import { fmtDate, talentPost, type ApprovalItem, type MatchItem } from "@/lib/talent";
import { cn } from "@/lib/utils";
import {
  ColumnFilter,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  Person,
  RelativeTime,
  ScoreBar,
  SearchBox,
  Toolbar,
  selectColumn,
} from "./data-table";
import { Panel, Pill } from "./TalentShell";

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

const MET_WORD = { yes: "Met", no: "Not met", unclear: "Unclear" } as const;

function role(m: MatchItem | null): string {
  return [m?.profile.current_designation, m?.profile.current_company].filter(Boolean).join(" at ");
}

/** Why the agent proposes this person: strengths, gaps and risk flags as plain text. */
function whyParts(m: MatchItem | null) {
  return {
    strengths: (m?.strengths ?? []).map((s) => s.strength).filter(Boolean),
    gaps: (m?.gaps ?? []).filter(Boolean),
    risks: (m?.risk_flags ?? []).map((r) => r.flag).filter(Boolean),
  };
}

function whySummary(m: MatchItem | null): string {
  const p = whyParts(m);
  if (p.strengths.length) return p.strengths.join("; ");
  if (p.gaps.length) return `Gaps: ${p.gaps.join("; ")}`;
  return "";
}

function mustHaveCounts(m: MatchItem | null): { met: number; total: number } {
  const list = m?.must_haves ?? [];
  return { met: list.filter((h) => h.met === "yes").length, total: list.length };
}

const TONE = {
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  red: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

/** "3/4 met", the full list on hover. */
function MustHaves({ m }: { m: MatchItem | null }) {
  const list = m?.must_haves ?? [];
  if (!list.length) return <span className="text-muted-foreground">—</span>;
  const { met, total } = mustHaveCounts(m);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          tabIndex={0}
          className={cn("cursor-default tabular-nums", met === total ? TONE.green : met === 0 ? TONE.red : TONE.amber)}
        >
          {met}/{total} met
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm">
        <ul className="space-y-1 text-left">
          {list.map((h) => (
            <li key={h.requirement}>
              <span className="font-semibold">{MET_WORD[h.met]}</span> — {h.requirement}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function WhyList({ parts }: { parts: ReturnType<typeof whyParts> }) {
  const sections: [string, string[]][] = [
    ["Strengths", parts.strengths],
    ["Gaps", parts.gaps],
    ["Risk flags", parts.risks],
  ];
  return (
    <div className="space-y-2 text-left">
      {sections
        .filter(([, items]) => items.length)
        .map(([title, items]) => (
          <div key={title}>
            <div className="font-semibold">{title}</div>
            <ul className="list-disc space-y-0.5 pl-4">
              {items.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}

/** The reason in one truncated line; strengths, gaps and risks in full on hover. */
function Why({ m }: { m: MatchItem | null }) {
  const parts = whyParts(m);
  const summary = whySummary(m);
  if (!summary && !parts.risks.length) return <span className="text-muted-foreground">—</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div tabIndex={0} className="flex max-w-80 min-w-40 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <span className="truncate text-foreground">{summary || "No strengths recorded"}</span>
          {parts.risks.length > 0 && (
            <Badge variant="secondary" className={cn("shrink-0", TONE.amber)}>
              <TriangleAlert aria-hidden />
              {plural(parts.risks.length, "risk")}
            </Badge>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-sm">
        <WhyList parts={parts} />
      </TooltipContent>
    </Tooltip>
  );
}

/** The evidence behind a proposal, shown when its row is opened. */
function ApprovalDetail({ item }: { item: ApprovalItem }) {
  const m = item.match;
  if (!m) return <p className="text-sm text-muted-foreground">The match behind this request is no longer available.</p>;
  const p = m.profile;
  const facts = [
    p.experience_years != null ? `${p.experience_years} yrs experience` : null,
    p.city,
    p.notice_period_days != null ? `${p.notice_period_days}-day notice` : null,
    p.last_verified_at ? `confirmed ${fmtDate(p.last_verified_at)}` : null,
  ].filter(Boolean);
  const heading = "mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase";
  return (
    <div className="space-y-4 text-sm">
      {facts.length > 0 && <div className="text-muted-foreground">{facts.join(" · ")}</div>}
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        {m.must_haves && m.must_haves.length > 0 && (
          <div>
            <div className={heading}>Must-haves</div>
            <ul className="space-y-2">
              {m.must_haves.map((h) => (
                <li key={h.requirement} className="flex items-start gap-2">
                  <Pill tone={h.met === "yes" ? "green" : h.met === "no" ? "red" : "amber"}>{MET_WORD[h.met]}</Pill>
                  <div className="min-w-0">
                    <div className="text-foreground">{h.requirement}</div>
                    {h.evidence && <div className="text-xs text-muted-foreground">“{h.evidence}”</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="space-y-4">
          {m.strengths && m.strengths.length > 0 && (
            <div>
              <div className={heading}>Strengths</div>
              <ul className="space-y-1.5">
                {m.strengths.map((s) => (
                  <li key={s.strength}>
                    <div className="text-foreground">{s.strength}</div>
                    {s.evidence && <div className="text-xs text-muted-foreground">“{s.evidence}”</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {m.gaps && m.gaps.length > 0 && (
            <div>
              <div className={heading}>Gaps</div>
              <ul className="list-disc space-y-0.5 pl-4 text-foreground">
                {m.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          {m.risk_flags && m.risk_flags.length > 0 && (
            <div>
              <div className={heading}>Risk flags</div>
              <ul className="space-y-1.5">
                {m.risk_flags.map((r) => (
                  <li key={r.flag}>
                    <div className="flex items-center gap-1.5 text-foreground">
                      <TriangleAlert className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                      {r.flag}
                    </div>
                    {r.evidence && <div className="text-xs text-muted-foreground">“{r.evidence}”</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface Decision {
  decided: number;
  invites_started: number;
}

/** Copilot: the agent proposes, a recruiter decides who is invited. */
export function ApprovalsPanel({ items, onDone }: { items: ApprovalItem[]; onDone: () => void }) {
  const [busy, setBusy] = useState<Set<string>>(new Set());

  // The endpoint takes a list: one request decides every selected row (rows
  // no longer waiting are skipped by the server and counted below).
  const decide = useCallback(
    async (rows: ApprovalItem[], approve: boolean, clear?: () => void) => {
      if (!rows.length) return;
      const ids = rows.map((r) => r.id);
      setBusy(new Set(ids));
      try {
        const r = await talentPost<Decision>("/approvals/decide", { approval_ids: ids, approve });
        const skipped = ids.length - r.decided;
        const note = skipped > 0 ? ` · ${skipped} skipped (no longer waiting)` : "";
        notifySuccess(
          approve
            ? `${plural(r.invites_started, "invite")} on their way${note}`
            : `${r.decided.toLocaleString()} declined — nobody is messaged${note}`,
        );
        clear?.();
        onDone();
      } catch (e) {
        notifyError((e as Error).message);
      } finally {
        setBusy(new Set());
      }
    },
    [onDone],
  );

  const working = busy.size > 0;

  const columns = useMemo<ColumnDef<ApprovalItem, unknown>[]>(
    () => [
      selectColumn<ApprovalItem>(),
      {
        id: "expand",
        size: 28,
        enableHiding: false,
        enableSorting: false,
        enableGlobalFilter: false,
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
        accessorFn: (a) => [a.match?.profile.name, role(a.match)].filter(Boolean).join(" "),
        meta: { label: "Candidate" },
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Candidate" />,
        cell: ({ row }) => {
          const m = row.original.match;
          return (
            <div className="max-w-64 min-w-44">
              <Person name={m?.profile.name ?? "Candidate"} sub={role(m)} seed={m?.profile_id ?? row.original.id} />
            </div>
          );
        },
      },
      {
        id: "rank",
        accessorFn: (a) => a.match?.rank || undefined,
        sortUndefined: "last",
        enableGlobalFilter: false,
        meta: { label: "Rank" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Rank" align="right" />,
        cell: ({ row }) => {
          const rank = row.original.match?.rank;
          return <div className="text-right tabular-nums text-muted-foreground">{rank ? `#${rank}` : "—"}</div>;
        },
      },
      {
        id: "score",
        accessorFn: (a) => a.match?.ai_score ?? undefined,
        sortUndefined: "last",
        sortDescFirst: true,
        enableGlobalFilter: false,
        meta: { label: "Match score" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Score" />,
        cell: ({ row }) => <ScoreBar value={row.original.match?.ai_score} />,
      },
      {
        id: "must_haves",
        accessorFn: (a) => {
          const { met, total } = mustHaveCounts(a.match);
          return total ? met / total : undefined;
        },
        sortUndefined: "last",
        sortDescFirst: true,
        enableGlobalFilter: false,
        meta: { label: "Must-haves" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Must-haves" />,
        cell: ({ row }) => <MustHaves m={row.original.match} />,
      },
      {
        id: "why",
        accessorFn: (a) => whySummary(a.match),
        enableSorting: false,
        meta: { label: "Why" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Why" />,
        cell: ({ row }) => <Why m={row.original.match} />,
      },
      {
        id: "freshness",
        accessorFn: (a) => a.match?.profile.verification_status ?? "unknown",
        filterFn: "oneOf",
        enableGlobalFilter: false,
        meta: { label: "Freshness" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Freshness" />,
        cell: ({ row }) => <Pill>{row.original.match?.profile.verification_status ?? "unknown"}</Pill>,
      },
      {
        id: "queued",
        accessorKey: "requested_at",
        enableGlobalFilter: false,
        meta: { label: "Queued" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Queued" />,
        cell: ({ row }) => <RelativeTime iso={row.original.requested_at} className="text-muted-foreground" />,
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        enableGlobalFilter: false,
        header: () => <span className="sr-only">Decide</span>,
        cell: ({ row }) => {
          const name = row.original.match?.profile.name ?? "this candidate";
          const mine = busy.has(row.original.id);
          return (
            <div className="flex justify-end gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={working}
                    aria-label={`Decline ${name}`}
                    onClick={() => decide([row.original], false)}
                  >
                    <X />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Decline — nobody is messaged</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8 text-emerald-600 dark:text-emerald-400"
                    disabled={working}
                    aria-label={`Approve invite for ${name}`}
                    onClick={() => decide([row.original], true)}
                  >
                    {mine ? <Loader2 className="animate-spin" /> : <Check />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Approve — send the invite</TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    [busy, working, decide],
  );

  const freshness = useMemo(() => {
    const seen = new Set(items.map((a) => a.match?.profile.verification_status ?? "unknown"));
    return [...seen].sort().map((v) => ({ value: v, label: v.replace(/_/g, " ") }));
  }, [items]);

  if (items.length === 0) return null;

  return (
    <Panel
      className="min-w-0"
      title={`Awaiting your approval · ${items.length}`}
      description="Copilot mode: these candidates are invited only once you approve them. Declining sends nothing. Select rows to decide in bulk, or click a row for the evidence."
    >
      <DataTable
        storageKey="approvals"
        columns={columns}
        data={items}
        getRowId={(a) => a.id}
        // Everyone starts selected, as before: one click approves the list.
        initialSelected={items.map((a) => a.id)}
        // Fits a laptop screen; both are a click away under View.
        initialHidden={["rank", "queued"]}
        renderExpanded={(a) => <ApprovalDetail item={a} />}
        initialSorting={[{ id: "score", desc: true }]}
        pageSize={50}
        noPagination={items.length <= 50}
        empty={<EmptyState icon={Search} title="No candidates match" description="Clear the search or the filter to see everyone waiting." />}
        bulkActions={(rows, clear) => (
          <>
            <Button variant="outline" className="h-8" disabled={working} onClick={() => decide(rows, false, clear)}>
              <X /> Decline selected
            </Button>
            <Button variant="primary" className="h-8" disabled={working} onClick={() => decide(rows, true, clear)}>
              {working ? <Loader2 className="animate-spin" /> : <Check />} Approve {plural(rows.length, "invite")}
            </Button>
          </>
        )}
        toolbar={(table) => (
          <Toolbar table={table}>
            <SearchBox
              value={(table.getState().globalFilter as string) ?? ""}
              onChange={(v) => table.setGlobalFilter(v)}
              placeholder="Search candidates…"
            />
            {freshness.length > 1 && <ColumnFilter column={table.getColumn("freshness")} title="Freshness" options={freshness} />}
          </Toolbar>
        )}
      />
    </Panel>
  );
}
