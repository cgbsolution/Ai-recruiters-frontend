"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notifyError } from "@/lib/notify";
import { fmtDate, talentGet, type AuditPage } from "@/lib/talent";
import { Panel, TalentShell, useTalentOrg } from "./TalentShell";

/** Select items cannot carry an empty value, so "no filter" is this sentinel in the UI and "" in state. */
const ALL = "__all__";

function describeActor(actor: string) {
  if (actor.startsWith("user:")) return `Recruiter #${actor.slice(5)}`;
  return { agent: "Agent", candidate: "Candidate", system: "System", app: "App" }[actor] ?? actor;
}

function AuditBody() {
  const { orgId } = useTalentOrg();
  const params = useSearchParams();
  const [profileId, setProfileId] = useState(params.get("profile_id") ?? "");
  const [action, setAction] = useState(params.get("action") ?? "");
  const [actor, setActor] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page), page_size: "50" });
    if (profileId.trim()) q.set("profile_id", profileId.trim());
    if (action) q.set("action", action);
    if (actor) q.set("actor", actor);
    try {
      setData(await talentGet<AuditPage>(`/audit?${q}`));
    } catch (e) {
      notifyError((e as Error).message);
    }
  }, [page, profileId, action, actor]);

  useEffect(() => {
    load();
  }, [load, orgId]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <Panel
      title="Audit log"
      description="Every message sent, every AI score, every human decision and every deletion. Ids and counts only — no contact details."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="w-40"
          placeholder="Candidate (profile id)"
          aria-label="Candidate (profile id)"
          inputMode="numeric"
          value={profileId}
          onChange={(e) => {
            setPage(1);
            setProfileId(e.target.value.replace(/\D/g, ""));
          }}
        />
        <Select
          value={action || ALL}
          onValueChange={(v) => {
            setPage(1);
            setAction(v === ALL ? "" : v);
          }}
        >
          <SelectTrigger aria-label="Action">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All actions</SelectItem>
            {data?.actions.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={actor || ALL}
          onValueChange={(v) => {
            setPage(1);
            setActor(v === ALL ? "" : v);
          }}
        >
          <SelectTrigger aria-label="Actor">
            <SelectValue placeholder="Anyone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Anyone</SelectItem>
            {data?.actors.map((a) => (
              <SelectItem key={a} value={a}>
                {describeActor(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Table className="text-left">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="pl-0 pr-4 text-xs uppercase tracking-wide text-muted-foreground">When</TableHead>
              <TableHead className="pl-0 pr-4 text-xs uppercase tracking-wide text-muted-foreground">Who</TableHead>
              <TableHead className="pl-0 pr-4 text-xs uppercase tracking-wide text-muted-foreground">Action</TableHead>
              <TableHead className="pl-0 pr-4 text-xs uppercase tracking-wide text-muted-foreground">Subject</TableHead>
              <TableHead className="px-0 text-xs uppercase tracking-wide text-muted-foreground">Candidate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data &&
              Array.from({ length: 8 }, (_, i) => (
                <TableRow key={i} className="border-border hover:bg-transparent">
                  <TableCell colSpan={5} className="px-0">
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {data?.items.map((r) => (
              <React.Fragment key={r.id}>
                <TableRow
                  className="cursor-pointer border-border"
                  data-state={open === r.id ? "selected" : undefined}
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                >
                  <TableCell className="pl-0 pr-4 tabular-nums text-gray-600 dark:text-gray-300">{fmtDate(r.at, true)}</TableCell>
                  <TableCell className="pl-0 pr-4 text-gray-800 dark:text-gray-200">{describeActor(r.actor)}</TableCell>
                  <TableCell className="pl-0 pr-4 font-mono text-xs text-gray-900 dark:text-gray-100">{r.action}</TableCell>
                  <TableCell className="pl-0 pr-4 text-gray-600 dark:text-gray-300">
                    {r.subject_type}
                    {r.subject_id ? <span className="ml-1 font-mono text-xs text-muted-foreground">{r.subject_id.slice(0, 12)}</span> : null}
                  </TableCell>
                  <TableCell className="px-0 tabular-nums text-gray-600 dark:text-gray-300">{r.profile_id ?? "—"}</TableCell>
                </TableRow>
                {open === r.id && r.detail && (
                  <TableRow className="border-border hover:bg-transparent">
                    <TableCell colSpan={5} className="whitespace-normal bg-muted/50 px-3 py-2">
                      <pre className="whitespace-pre-wrap break-all font-mono text-xs text-gray-700 dark:text-gray-300">
                        {JSON.stringify(r.detail, null, 2)}
                      </pre>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
        {data && data.items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nothing matches.</p>}
      </div>

      {data && data.total > data.page_size && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {data.total.toLocaleString()} entries · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

export default function AuditView() {
  return (
    <TalentShell title="Talent Agent audit" subtitle="Filter by candidate, action and actor.">
      <AuditBody />
    </TalentShell>
  );
}
