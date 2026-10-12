"use client";

import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { notifyError, notifySuccess } from "@/lib/notify";
import { LOOP_LABELS, talentGet, talentPut, type TalentSettings } from "@/lib/talent";
import { cn } from "@/lib/utils";
import { EmailBranding } from "./EmailBranding";
import { Panel, TalentShell, Warnings, useTalentOrg } from "./TalentShell";

/** Label + control + optional help. The control must carry `id`, and `aria-describedby={`${id}-help`}` when there is help. */
function Field({
  id,
  label,
  help,
  hideLabel,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  hideLabel?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={cn(hideLabel && "sr-only")}>
        {label}
      </Label>
      {children}
      {help && (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
    </div>
  );
}

function SettingsBody() {
  const { isAdmin, orgId } = useTalentOrg();
  const [s, setS] = useState<TalentSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [retention, setRetention] = useState<{ due: number; deletes_enabled: boolean } | null>(null);

  useEffect(() => {
    talentGet<TalentSettings>("/settings").then(setS).catch((e) => notifyError(e.message));
    talentGet<{ due: number; deletes_enabled: boolean }>("/retention").then(setRetention).catch(() => setRetention(null));
  }, [orgId]);

  if (!s) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading">
        <Skeleton className="h-48 w-full" />
        <div className="grid gap-6 xl:grid-cols-2">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

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
        <div className="divide-y divide-border">
          {Object.entries(LOOP_LABELS).map(([key, { label, help }]) => (
            <div key={key} className="flex items-start justify-between gap-6 py-3">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">{label}</div>
                <div className="text-xs text-muted-foreground">{help}</div>
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
            <Field id="settings-timezone" label="Time zone">
              <Input id="settings-timezone" disabled={!isAdmin} value={s.timezone} onChange={(e) => set("timezone", e.target.value)} />
            </Field>
            <Field id="settings-sender-domain" label="Sender domain" help="The From address's domain; caps and warm-up are counted per domain.">
              <Input
                id="settings-sender-domain"
                aria-describedby="settings-sender-domain-help"
                disabled={!isAdmin}
                value={s.sender_domain}
                onChange={(e) => set("sender_domain", e.target.value)}
              />
            </Field>
            <Field id="settings-quiet-start" label="Quiet hours start (local hour)">
              <Input
                id="settings-quiet-start"
                type="number"
                min={0}
                max={23}
                disabled={!isAdmin}
                value={s.quiet_hours_start}
                onChange={(e) => set("quiet_hours_start", Number(e.target.value))}
              />
            </Field>
            <Field id="settings-quiet-end" label="Quiet hours end (local hour)" help="Same start and end turns quiet hours off.">
              <Input
                id="settings-quiet-end"
                aria-describedby="settings-quiet-end-help"
                type="number"
                min={0}
                max={23}
                disabled={!isAdmin}
                value={s.quiet_hours_end}
                onChange={(e) => set("quiet_hours_end", Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="mt-4 space-y-2">
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Daily send cap ramp</div>
            <div className="text-xs text-muted-foreground">A new domain starts low and earns volume.</div>
            {s.send_ramp.map((step, i) => (
              <div key={i} className="grid grid-cols-2 gap-3">
                <Field id={`settings-ramp-from-${i}`} label="From day" hideLabel={i > 0}>
                  <Input
                    id={`settings-ramp-from-${i}`}
                    type="number"
                    min={0}
                    disabled={!isAdmin || i === 0}
                    value={step.from_day}
                    onChange={(e) => set("send_ramp", s.send_ramp.map((x, j) => (j === i ? { ...x, from_day: Number(e.target.value) } : x)))}
                  />
                </Field>
                <Field id={`settings-ramp-cap-${i}`} label="Messages per day" hideLabel={i > 0}>
                  <Input
                    id={`settings-ramp-cap-${i}`}
                    type="number"
                    min={0}
                    disabled={!isAdmin}
                    value={step.cap}
                    onChange={(e) => set("send_ramp", s.send_ramp.map((x, j) => (j === i ? { ...x, cap: Number(e.target.value) } : x)))}
                  />
                </Field>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Candidates" description="Freshness, retention and what candidates are told.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="settings-refresh-days" label="Ask to update every (days)" help="90 = every 3 months (30 to 730).">
              <Input
                id="settings-refresh-days"
                aria-describedby="settings-refresh-days-help"
                type="number"
                min={30}
                max={730}
                disabled={!isAdmin}
                value={s.refresh_after_days}
                onChange={(e) => set("refresh_after_days", Number(e.target.value))}
              />
            </Field>
            <Field
              id="settings-retention"
              label="Keep CVs for (months)"
              help={`Counted from the candidate's last confirmation.${retention ? ` ${retention.due.toLocaleString()} profiles are past it now${retention.deletes_enabled ? " and are deleted daily" : " (deleted only if “Retention deletes” is on)"}.` : ""}`}
            >
              <Input
                id="settings-retention"
                aria-describedby="settings-retention-help"
                type="number"
                min={1}
                max={120}
                disabled={!isAdmin}
                value={s.retention_months}
                onChange={(e) => set("retention_months", Number(e.target.value))}
              />
            </Field>
            <Field id="settings-autonomy" label="Default autonomy for new jobs" help="Copilot: you approve invites. Submissions and rejections always need you.">
              <Select
                disabled={!isAdmin}
                value={s.default_autonomy}
                onValueChange={(v) => set("default_autonomy", v as "autopilot" | "copilot")}
              >
                <SelectTrigger id="settings-autonomy" aria-describedby="settings-autonomy-help" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="copilot">Copilot</SelectItem>
                  <SelectItem value="autopilot">Autopilot</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="mt-4">
            <Field id="settings-consent" label="Consent text" help="Shown next to the consent choices on the refresh page.">
              <Textarea
                id="settings-consent"
                aria-describedby="settings-consent-help"
                rows={4}
                className="min-h-24"
                disabled={!isAdmin}
                value={s.consent_text}
                onChange={(e) => set("consent_text", e.target.value)}
              />
            </Field>
          </div>
        </Panel>
      </div>

      <EmailBranding branding={s.branding} isAdmin={isAdmin} onSaved={setS} />

      <Panel title="Models" description="Set with environment variables on the server (TALENT_*_MODEL, EMBEDDING_PROVIDER).">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
          {Object.entries(s.models).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
              <dd className="font-mono text-gray-900 dark:text-gray-100">{v}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">embeddings</dt>
            <dd className="font-mono text-gray-900 dark:text-gray-100">{s.embedding_provider ?? "off"}</dd>
          </div>
        </dl>
      </Panel>

      {isAdmin && (
        <div className="flex justify-end">
          <Button variant="primary" size="lg" disabled={saving} onClick={() => save()}>
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
