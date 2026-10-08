"use client";

import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { notifyError, notifySuccess } from "@/lib/notify";
import { LOOP_LABELS, talentGet, talentPut, type TalentSettings } from "@/lib/talent";
import { Panel, TalentShell, Warnings, useTalentOrg } from "./TalentShell";

const input =
  "h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 disabled:opacity-60 dark:border-white/10 dark:bg-gray-900 dark:text-gray-100";

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
      {children}
      {help && <span className="block text-xs text-gray-500 dark:text-gray-400">{help}</span>}
    </label>
  );
}

function SettingsBody() {
  const { isAdmin, orgId } = useTalentOrg();
  const [s, setS] = useState<TalentSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    talentGet<TalentSettings>("/settings").then(setS).catch((e) => notifyError(e.message));
  }, [orgId]);

  if (!s) return <div className="py-10 text-center text-sm text-gray-500">Loading…</div>;

  const set = <K extends keyof TalentSettings>(k: K, v: TalentSettings[K]) => setS({ ...s, [k]: v });

  const save = async (patch?: Partial<TalentSettings>) => {
    setSaving(true);
    try {
      const body = patch ?? {
        timezone: s.timezone,
        quiet_hours_start: s.quiet_hours_start,
        quiet_hours_end: s.quiet_hours_end,
        refresh_after_days: s.refresh_after_days,
        retention_months: s.retention_months,
        default_autonomy: s.default_autonomy,
        sender_domain: s.sender_domain,
        consent_text: s.consent_text,
        send_ramp: s.send_ramp,
      };
      setS(await talentPut<TalentSettings>("/settings", body));
      notifySuccess("Saved");
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Warnings items={s.warnings} />

      <Panel
        title="Loops"
        description={
          s.agent_enabled
            ? "Each loop runs only while its switch is on. Turning one off stops its sends at the next step."
            : "The master switch (TALENT_AGENT_ENABLED) is off on the server, so nothing runs whatever these say."
        }
      >
        <div className="divide-y divide-gray-100 dark:divide-white/5">
          {Object.entries(LOOP_LABELS).map(([key, { label, help }]) => (
            <div key={key} className="flex items-start justify-between gap-6 py-3">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">{label}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{help}</div>
              </div>
              <Switch
                checked={!!s.flags[key]}
                disabled={!isAdmin || saving}
                aria-label={label}
                onCheckedChange={(on) => save({ flags: { [key]: on } } as Partial<TalentSettings>)}
              />
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Outreach" description="When and how much the agent may send.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Time zone">
              <input className={input} disabled={!isAdmin} value={s.timezone} onChange={(e) => set("timezone", e.target.value)} />
            </Field>
            <Field label="Sender domain" help="The From address's domain; caps and warm-up are counted per domain.">
              <input className={input} disabled={!isAdmin} value={s.sender_domain} onChange={(e) => set("sender_domain", e.target.value)} />
            </Field>
            <Field label="Quiet hours start (local hour)">
              <input type="number" min={0} max={23} className={input} disabled={!isAdmin} value={s.quiet_hours_start}
                onChange={(e) => set("quiet_hours_start", Number(e.target.value))} />
            </Field>
            <Field label="Quiet hours end (local hour)" help="Same start and end turns quiet hours off.">
              <input type="number" min={0} max={23} className={input} disabled={!isAdmin} value={s.quiet_hours_end}
                onChange={(e) => set("quiet_hours_end", Number(e.target.value))} />
            </Field>
          </div>
          <div className="mt-4 space-y-2">
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Daily send cap ramp</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">A new domain starts low and earns volume.</div>
            {s.send_ramp.map((step, i) => (
              <div key={i} className="grid grid-cols-2 gap-3">
                <Field label={i === 0 ? "From day" : ""}>
                  <input type="number" min={0} className={input} disabled={!isAdmin || i === 0} value={step.from_day}
                    onChange={(e) => set("send_ramp", s.send_ramp.map((x, j) => (j === i ? { ...x, from_day: Number(e.target.value) } : x)))} />
                </Field>
                <Field label={i === 0 ? "Messages per day" : ""}>
                  <input type="number" min={0} className={input} disabled={!isAdmin} value={step.cap}
                    onChange={(e) => set("send_ramp", s.send_ramp.map((x, j) => (j === i ? { ...x, cap: Number(e.target.value) } : x)))} />
                </Field>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Candidates" description="Freshness, retention and what candidates are told.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ask to re-confirm after (days)">
              <input type="number" min={30} max={730} className={input} disabled={!isAdmin} value={s.refresh_after_days}
                onChange={(e) => set("refresh_after_days", Number(e.target.value))} />
            </Field>
            <Field label="Keep CVs for (months)" help="Counted from the candidate's last confirmation.">
              <input type="number" min={1} max={120} className={input} disabled={!isAdmin} value={s.retention_months}
                onChange={(e) => set("retention_months", Number(e.target.value))} />
            </Field>
            <Field label="Default autonomy for new jobs" help="Copilot: you approve invites. Submissions and rejections always need you.">
              <select className={input} disabled={!isAdmin} value={s.default_autonomy}
                onChange={(e) => set("default_autonomy", e.target.value as "autopilot" | "copilot")}>
                <option value="copilot">Copilot</option>
                <option value="autopilot">Autopilot</option>
              </select>
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Consent text" help="Shown next to the consent choices on the refresh page.">
              <textarea rows={4} className={`${input} h-auto py-2`} disabled={!isAdmin} value={s.consent_text}
                onChange={(e) => set("consent_text", e.target.value)} />
            </Field>
          </div>
        </Panel>
      </div>

      <Panel title="Models" description="Set with environment variables on the server (TALENT_*_MODEL, EMBEDDING_PROVIDER).">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
          {Object.entries(s.models).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{k}</dt>
              <dd className="font-mono text-gray-900 dark:text-gray-100">{v}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">embeddings</dt>
            <dd className="font-mono text-gray-900 dark:text-gray-100">{s.embedding_provider ?? "off"}</dd>
          </div>
        </dl>
      </Panel>

      {isAdmin && (
        <div className="flex justify-end">
          <Button variant="primary" className="h-10 py-0" disabled={saving} onClick={() => save()}>
            <Save /> Save settings
          </Button>
        </div>
      )}
    </div>
  );
}

export default function TalentSettingsView() {
  return (
    <TalentShell title="Talent Agent settings" subtitle="Switches, limits and candidate-facing text for your organization.">
      <SettingsBody />
    </TalentShell>
  );
}
