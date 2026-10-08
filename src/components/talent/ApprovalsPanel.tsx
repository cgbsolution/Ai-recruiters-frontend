"use client";

import React, { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@/lib/notify";
import { talentPost, type ApprovalItem } from "@/lib/talent";
import { Panel, Pill, quietButton } from "./TalentShell";

/** Copilot: the agent proposes, a recruiter decides who is invited. */
export function ApprovalsPanel({ items, onDone }: { items: ApprovalItem[]; onDone: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(items.map((i) => i.id)));
  const [busy, setBusy] = useState(false);
  if (items.length === 0) return null;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const decide = async (approve: boolean) => {
    if (!selected.size) return;
    setBusy(true);
    try {
      const r = await talentPost<{ decided: number; invites_started: number }>("/approvals/decide", {
        approval_ids: [...selected],
        approve,
      });
      notifySuccess(approve ? `${r.invites_started} invites on their way` : `${r.decided} declined — nobody is messaged`);
      onDone();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={`Awaiting your approval · ${items.length}`}
      description="Copilot mode: these candidates are invited only once you approve them. Declining sends nothing."
      action={
        <div className="flex gap-2">
          <Button className={quietButton} variant="outline" disabled={busy || !selected.size} onClick={() => decide(false)}>
            <X /> Decline
          </Button>
          <Button variant="primary" className="h-9 py-0" disabled={busy || !selected.size} onClick={() => decide(true)}>
            <Check /> Approve {selected.size} invite{selected.size === 1 ? "" : "s"}
          </Button>
        </div>
      }
    >
      <ul className="divide-y divide-gray-100 dark:divide-white/5">
        {items.map((a) => {
          const m = a.match;
          return (
            <li key={a.id} className="flex items-center gap-3 py-2.5">
              <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={selected.has(a.id)} onChange={() => toggle(a.id)}
                aria-label={`Select ${m?.profile.name ?? "candidate"}`} />
              <span className="w-10 text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{m?.ai_score ?? "—"}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-900 dark:text-white">{m?.profile.name ?? "Candidate"}</div>
                <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {[m?.profile.current_designation, m?.profile.current_company].filter(Boolean).join(" at ")}
                  {m?.must_haves ? ` · ${m.must_haves.filter((h) => h.met === "yes").length}/${m.must_haves.length} must-haves met` : ""}
                </div>
              </div>
              {m && <Pill>{m.profile.verification_status}</Pill>}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
