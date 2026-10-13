"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ArrowUpRight, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { talentGet, type ShortlistRow } from "@/lib/talent";
import {
  ColumnFilter,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  Person,
  RowActions,
  ScoreBar,
  SearchBox,
  Toolbar,
  type FilterOption,
} from "./data-table";
import { Panel, Pill } from "./TalentShell";

const interviewHref = (r: ShortlistRow) => `/talent/interviews/${r.interview_id}`;
const nameOf = (r: ShortlistRow) => r.candidate ?? `Profile ${r.profile_id}`;

/** Exact-value facet filter (the ColumnFilter sets a string[]). */

/** Lists longer than this get search, a state filter and pages. */
const SMALL = 10;

function RiskFlags({ n }: { n: number }) {
  if (n <= 0)
    return (
      <Badge variant="outline" className="font-normal text-muted-foreground">
        <ShieldCheck aria-hidden /> none
      </Badge>
    );
  return (
    <Badge
      variant="secondary"
      className="border-transparent bg-amber-50 font-normal text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
    >
      <AlertTriangle aria-hidden />
      <span className="font-semibold tabular-nums">{n}</span> {n === 1 ? "flag" : "flags"}
    </Badge>
  );
}

/** Interviewed candidates in suggested order. A sort order only — it decides nothing. */
export function ShortlistPanel({ jobRef }: { jobRef: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<ShortlistRow[] | null>(null);

  useEffect(() => {
    let live = true;
    talentGet<ShortlistRow[]>(`/jobs/${jobRef}/shortlist`)
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [jobRef]);

  const stateOptions = useMemo<FilterOption[]>(
    () =>
      [...new Set((rows ?? []).map((r) => r.status))].sort().map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
    [rows],
  );

  const columns = useMemo<ColumnDef<ShortlistRow, unknown>[]>(
    () => [
      {
        accessorKey: "rank",
        meta: { label: "Rank" },
        size: 56,
        enableHiding: false,
        enableGlobalFilter: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="#" />,
        cell: ({ row }) => <span className="font-medium tabular-nums text-muted-foreground">{row.original.rank}</span>,
      },
      {
        id: "candidate",
        accessorFn: (r) => [nameOf(r), r.current_designation].filter(Boolean).join(" · "),
        meta: { label: "Candidate" },
        enableHiding: false,
        sortingFn: "text",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Candidate" />,
        cell: ({ row }) => (
          <Link
            href={interviewHref(row.original)}
            title={`Open ${nameOf(row.original)}'s interview`}
            className="block max-w-64 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 hover:[&_.font-medium]:underline"
          >
            <Person name={nameOf(row.original)} sub={row.original.current_designation} seed={row.original.profile_id} />
          </Link>
        ),
      },
      {
        accessorKey: "composite",
        meta: { label: "Shortlist score" },
        enableGlobalFilter: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Shortlist" />,
        cell: ({ row }) => <ScoreBar value={row.original.composite} max={100} />,
      },
      {
        accessorKey: "interview_score",
        meta: { label: "Interview score" },
        enableGlobalFilter: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Interview /5" />,
        cell: ({ row }) => <ScoreBar value={row.original.interview_score} max={5} />,
      },
      {
        id: "ai_score",
        accessorFn: (r) => r.ai_score ?? undefined,
        meta: { label: "Match score" },
        enableGlobalFilter: false,
        sortUndefined: "last",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Match /100" />,
        cell: ({ row }) => <ScoreBar value={row.original.ai_score} max={100} />,
      },
      {
        accessorKey: "risk_flags",
        meta: { label: "Risk flags" },
        enableGlobalFilter: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Risk flags" />,
        cell: ({ row }) => <RiskFlags n={row.original.risk_flags} />,
      },
      {
        accessorKey: "status",
        meta: { label: "State" },
        enableGlobalFilter: false,
        filterFn: "oneOf",
        header: ({ column }) => <DataTableColumnHeader column={column} title="State" />,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <Pill>{row.original.status}</Pill>
            {!row.original.reviewed && <Pill tone="amber">needs review</Pill>}
          </div>
        ),
      },
      {
        id: "actions",
        size: 48,
        enableSorting: false,
        enableHiding: false,
        enableGlobalFilter: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            actions={[{ label: "Open interview", icon: ArrowUpRight, onSelect: () => router.push(interviewHref(row.original)) }]}
          />
        ),
      },
    ],
    [router],
  );

  if (!rows || rows.length === 0) return null;
  const large = rows.length > SMALL;

  return (
    <Panel
      title="Shortlist order"
      description="Interviewed candidates, ordered by interview score (with your overrides), then match score, minus a small amount per risk flag. It's a reading order — submitting and closing are your calls."
    >
      <DataTable
        storageKey="shortlist"
        columns={columns}
        data={rows}
        getRowId={(r) => r.match_id}
        onRowClick={(r) => router.push(interviewHref(r))}
        initialSorting={[{ id: "rank", desc: false }]}
        initialHidden={["composite"]}
        noPagination={!large}
        empty={<EmptyState icon={Search} title="No candidates match" description="Clear the search or filter with Reset." />}
        toolbar={(table) => (
          <Toolbar table={table}>
            {large && (
              <>
                <SearchBox
                  value={String(table.getState().globalFilter ?? "")}
                  onChange={(v) => table.setGlobalFilter(v)}
                  placeholder="Search candidates…"
                />
                <ColumnFilter column={table.getColumn("status")} title="State" options={stateOptions} />
              </>
            )}
          </Toolbar>
        )}
      />
    </Panel>
  );
}
