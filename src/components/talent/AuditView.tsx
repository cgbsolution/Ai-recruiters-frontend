"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyError } from "@/lib/notify";
import { fmtDate, talentGet, type AuditPage } from "@/lib/talent";
import { Panel, TalentShell, quietButton, useTalentOrg } from "./TalentShell";

const input =
  "h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 dark:border-white/10 dark:bg-gray-900 dark:text-gray-100";

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
        <input
          className={`${input} w-40`}
          placeholder="Candidate (profile id)"
          inputMode="numeric"
          value={profileId}
          onChange={(e) => {
            setPage(1);
            setProfileId(e.target.value.replace(/\D/g, ""));
          }}
        />
        <select className={input} value={action} onChange={(e) => { setPage(1); setAction(e.target.value); }}>
          <option value="">All actions</option>
          {data?.actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select className={input} value={actor} onChange={(e) => { setPage(1); setActor(e.target.value); }}>
          <option value="">Anyone</option>
          {data?.actors.map((a) => (
            <option key={a} value={a}>{describeActor(a)}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
              <th className="py-2 pr-4 font-medium">When</th>
              <th className="py-2 pr-4 font-medium">Who</th>
              <th className="py-2 pr-4 font-medium">Action</th>
              <th className="py-2 pr-4 font-medium">Subject</th>
              <th className="py-2 font-medium">Candidate</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <React.Fragment key={r.id}>
                <tr
                  className="cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/[0.03]"
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                >
                  <td className="whitespace-nowrap py-2 pr-4 tabular-nums text-gray-600 dark:text-gray-300">{fmtDate(r.at, true)}</td>
                  <td className="py-2 pr-4 text-gray-800 dark:text-gray-200">{describeActor(r.actor)}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-900 dark:text-gray-100">{r.action}</td>
                  <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">
                    {r.subject_type}
                    {r.subject_id ? <span className="ml-1 font-mono text-xs text-gray-400">{r.subject_id.slice(0, 12)}</span> : null}
                  </td>
                  <td className="py-2 tabular-nums text-gray-600 dark:text-gray-300">{r.profile_id ?? "—"}</td>
                </tr>
                {open === r.id && r.detail && (
                  <tr className="border-b border-gray-100 dark:border-white/5">
                    <td colSpan={5} className="bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
                      <pre className="whitespace-pre-wrap break-all font-mono text-xs text-gray-700 dark:text-gray-300">
                        {JSON.stringify(r.detail, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && <p className="py-8 text-center text-sm text-gray-500">Nothing matches.</p>}
      </div>

      {data && data.total > data.page_size && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
          <span>
            {data.total.toLocaleString()} entries · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button className={quietButton} variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <Button className={quietButton} variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
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
