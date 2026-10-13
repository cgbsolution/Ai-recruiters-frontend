"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Bot, ChevronRight, Clock, Cog, History, Search, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notifyError } from "@/lib/notify";
import { talentGet, type AuditItem, type AuditPage } from "@/lib/talent";
import { cn } from "@/lib/utils";
import {
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  FacetedFilter,
  IdChip,
  Person,
  RelativeTime,
  SearchBox,
  Toolbar,
} from "./data-table";
import { Panel, TalentShell, useTalentOrg } from "./TalentShell";

const RANGES = [
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

/** Colour by area (the part before the first dot), always with the action text. */
const AREA_TONES: Record<string, string> = {
  match: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  invite: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  interview: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  refresh: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  campaign: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  consent: "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  retention: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  erasure: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

function ActionBadge({ action }: { action: string }) {
  const area = action.split(".")[0];
  return (
    <Badge variant="secondary" className={cn("rounded-md font-mono font-normal", AREA_TONES[area])}>
      {action}
    </Badge>
  );
}

function describeActor(actor: string) {
  if (actor.startsWith("user:")) return `Recruiter #${actor.slice(5)}`;
  return { agent: "Agent", candidate: "Candidate", system: "System", app: "App" }[actor] ?? actor;
}

function actorIcon(actor: string) {
  if (actor === "agent") return Bot;
  if (actor === "candidate") return UserRound;
  if (actor === "system" || actor === "app") return Cog;
  return undefined; // recruiters get initials
}

function sinceFor(range: string): string | null {
  if (range === "all") return null;
  return new Date(Date.now() - Number(range) * 86_400_000).toISOString().replace("Z", "");
}

function Detail({ item }: { item: AuditItem }) {
  const entries = Object.entries(item.detail ?? {});
  if (!entries.length) return <p className="text-sm text-muted-foreground">No further detail recorded.</p>;
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">
      {entries.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-muted-foreground">{k.replace(/_/g, " ")}</dt>
          <dd className="min-w-0">
            <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs break-all text-foreground">
              {typeof v === "string" ? v : JSON.stringify(v)}
            </code>
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/** Waits for typing to pause before the value is used. */
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function AuditBody() {
  const { orgId } = useTalentOrg();
  const params = useSearchParams();
  const [profileId, setProfileId] = useState(params.get("profile_id") ?? "");
  const [text, setText] = useState("");
  const [actions, setActions] = useState<string[]>(params.get("action") ? [params.get("action") as string] : []);
  const [actors, setActors] = useState<string[]>([]);
  const [range, setRange] = useState("30");
  const [paging, setPaging] = useState({ pageIndex: 0, pageSize: 20 });
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const q = useDebounced(text);
  const pid = useDebounced(profileId);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(paging.pageIndex + 1), page_size: String(paging.pageSize) });
    if (pid.trim()) qs.set("profile_id", pid.trim());
    if (q.trim()) qs.set("q", q.trim());
    actions.forEach((a) => qs.append("action", a));
    actors.forEach((a) => qs.append("actor", a));
    const since = sinceFor(range);
    if (since) qs.set("since", since);
    setLoading(true);
    try {
      setData(await talentGet<AuditPage>(`/audit?${qs}`));
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [paging, pid, q, actions, actors, range]);

  useEffect(() => {
    load();
  }, [load, orgId]);

  // Any filter change goes back to the first page.
  const refilter = <T,>(set: (v: T) => void) => (v: T) => {
    setPaging((p) => ({ ...p, pageIndex: 0 }));
    set(v);
  };

  const columns = useMemo<ColumnDef<AuditItem, unknown>[]>(
    () => [
      {
        id: "expand",
        size: 32,
        enableHiding: false,
        header: () => null,
        cell: ({ row }) => (
          <ChevronRight
            aria-hidden
            className={cn("size-4 text-muted-foreground transition-transform", row.getIsExpanded() && "rotate-90")}
          />
        ),
      },
      {
        accessorKey: "at",
        meta: { label: "When" },
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
        cell: ({ row }) => <RelativeTime iso={row.original.at} className="text-muted-foreground" />,
      },
      {
        accessorKey: "actor",
        meta: { label: "Who" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Who" />,
        cell: ({ row }) => (
          <Person name={describeActor(row.original.actor)} icon={actorIcon(row.original.actor)} seed={row.original.actor} />
        ),
      },
      {
        accessorKey: "action",
        meta: { label: "Action" },
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Action" />,
        cell: ({ row }) => <ActionBadge action={row.original.action} />,
      },
      {
        id: "subject",
        accessorFn: (r) => `${r.subject_type} ${r.subject_id ?? ""}`,
        meta: { label: "Subject" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Subject" />,
        cell: ({ row }) =>
          row.original.subject_id ? (
            <IdChip label={row.original.subject_type.replace(/_/g, " ")} value={row.original.subject_id} />
          ) : (
            <span className="text-muted-foreground">{row.original.subject_type.replace(/_/g, " ")}</span>
          ),
      },
      {
        accessorKey: "profile_id",
        meta: { label: "Candidate" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Candidate" />,
        cell: ({ row }) =>
          row.original.profile_id != null ? (
            <Button
              variant="link"
              className="h-auto p-0 font-mono text-xs"
              title="Show only this candidate"
              onClick={() => refilter(setProfileId)(String(row.original.profile_id))}
            >
              #{row.original.profile_id}
            </Button>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  );

  const filtered = !!(profileId || text || actions.length || actors.length || range !== "30");
  const reset = () => {
    setPaging((p) => ({ ...p, pageIndex: 0 }));
    setProfileId("");
    setText("");
    setActions([]);
    setActors([]);
    setRange("30");
  };

  return (
    <Panel
      title="Audit log"
      description="Every message sent, every AI score, every human decision and every deletion. Ids and counts only — no contact details. Click a row for its detail."
    >
      <DataTable
        storageKey="audit"
        columns={columns}
        data={loading && !data ? null : (data?.items ?? [])}
        getRowId={(r) => String(r.id)}
        renderExpanded={(r) => <Detail item={r} />}
        server={{
          pageIndex: paging.pageIndex,
          pageSize: paging.pageSize,
          total: data?.total ?? 0,
          onChange: setPaging,
        }}
        empty={
          <EmptyState
            icon={filtered ? Search : History}
            title={filtered ? "Nothing matches these filters" : "No activity yet"}
            description={
              filtered
                ? "Try a longer time range or clear a filter."
                : "Sends, scores, decisions and deletions appear here as the agent works."
            }
            action={
              filtered ? (
                <Button variant="outline" className="h-8" onClick={reset}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        }
        toolbar={(table) => (
          <Toolbar table={table} filtered={filtered} onReset={reset}>
            <SearchBox value={text} onChange={refilter(setText)} placeholder="Search action or subject…" />
            <SearchBox
              value={profileId}
              onChange={(v) => refilter(setProfileId)(v.replace(/\D/g, ""))}
              placeholder="Candidate id"
              inputMode="numeric"
              className="sm:w-36"
            />
            <FacetedFilter
              title="Action"
              selected={actions}
              onChange={refilter(setActions)}
              options={Object.entries(data?.action_counts ?? {})
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([value, count]) => ({ value, label: value, count }))}
            />
            <FacetedFilter
              title="Who"
              selected={actors}
              onChange={refilter(setActors)}
              options={Object.entries(data?.actor_counts ?? {}).map(([value, count]) => ({
                value,
                label: describeActor(value),
                icon: actorIcon(value),
                count,
              }))}
            />
            <Select value={range} onValueChange={refilter(setRange)}>
              <SelectTrigger size="sm" className="h-8 w-auto min-w-[150px]" aria-label="Time range">
                <Clock className="size-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Toolbar>
        )}
      />
    </Panel>
  );
}

export default function AuditView() {
  return (
    <TalentShell title="Talent Agent audit" subtitle="Who did what, when — searchable and filterable.">
      <AuditBody />
    </TalentShell>
  );
}
