"use client";

import React, { useEffect, useState } from "react";
import {
  AudioLines,
  CalendarClock,
  Cpu,
  Info,
  Loader2,
  Lock,
  Mic,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings,
  Sparkles,
  Trash2,
  UsersRound,
  Workflow,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { notifyError, notifySuccess } from "@/lib/notify";
import { LOOP_LABELS, talentGet, talentPut, type TalentSettings } from "@/lib/talent";
import { cn } from "@/lib/utils";
import { EmailBranding } from "./EmailBranding";
import { Panel, Pill, TalentShell, Warnings, useTalentOrg, type TalentIcon } from "./TalentShell";

const LOOP_ICONS: Record<string, TalentIcon> = {
  refresh: RefreshCw,
  refresh_rolling: CalendarClock,
  match: Sparkles,
  invite: Send,
  interview: Mic,
  live_voice: AudioLines,
  retention: Trash2,
};

/** The fields saved by the "Save settings" button (loop switches and branding save on their own). */
type Editable = Pick<
  TalentSettings,
  | "timezone"
  | "quiet_hours_start"
  | "quiet_hours_end"
  | "refresh_after_days"
  | "retention_months"
  | "default_autonomy"
  | "sender_domain"
  | "consent_text"
  | "send_ramp"
>;

const editable = (s: TalentSettings): Editable => ({
  timezone: s.timezone,
  quiet_hours_start: s.quiet_hours_start,
  quiet_hours_end: s.quiet_hours_end,
  refresh_after_days: s.refresh_after_days,
  retention_months: s.retention_months,
  default_autonomy: s.default_autonomy,
  sender_domain: s.sender_domain,
  consent_text: s.consent_text,
  send_ramp: s.send_ramp,
});

const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Label + control + optional help. The control must carry `id`, and `aria-describedby={`${id}-help`}` when there is help. */
function Field({
  id,
  label,
  help,
  hideLabel,
  className,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  hideLabel?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
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

/** A number input with its unit shown inside, on the right. */
function UnitInput({ unit, className, ...props }: React.ComponentProps<typeof Input> & { unit: string }) {
  return (
    <div className="relative">
      <Input {...props} className={cn("pr-16 tabular-nums", className)} />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
        {unit}
      </span>
    </div>
  );
}

function SubHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

function SettingsBody() {
  const { isAdmin, orgId } = useTalentOrg();
  const [s, setS] = useState<TalentSettings | null>(null);
  const [baseline, setBaseline] = useState<Editable | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyFlag, setBusyFlag] = useState<string | null>(null);
  const [retention, setRetention] = useState<{ due: number; deletes_enabled: boolean } | null>(null);

  useEffect(() => {
    talentGet<TalentSettings>("/settings")
      .then((out) => {
        setS(out);
        setBaseline(editable(out));
      })
      .catch((e) => notifyError(e.message));
    talentGet<{ due: number; deletes_enabled: boolean }>("/retention").then(setRetention).catch(() => setRetention(null));
  }, [orgId]);

  if (!s) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading">
        <Skeleton className="h-72 w-full rounded-xl" />
        <div className="grid gap-6 xl:grid-cols-2">
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  const set = <K extends keyof TalentSettings>(k: K, v: TalentSettings[K]) => setS((prev) => (prev ? { ...prev, [k]: v } : prev));
  const dirty = !!baseline && JSON.stringify(editable(s)) !== JSON.stringify(baseline);

  /** Take the server's copy; a partial save (a switch, branding) keeps unsaved edits in the form. */
  const absorb = (out: TalentSettings, replaceForm: boolean) => {
    setBaseline(editable(out));
    setS((prev) => (replaceForm || !prev ? out : { ...out, ...editable(prev) }));
  };

  const save = async (patch?: Partial<TalentSettings>) => {
    setSaving(true);
    try {
      const out = await talentPut<TalentSettings>("/settings", patch ?? editable(s));
      absorb(out, !patch);
      notifySuccess("Saved");
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleLoop = async (key: string, on: boolean) => {
    setBusyFlag(key);
    try {
      await save({ flags: { [key]: on } } as Partial<TalentSettings>);
    } finally {
      setBusyFlag(null);
    }
  };

  const discard = () => {
    if (baseline) setS((prev) => (prev ? { ...prev, ...baseline } : prev));
  };

  const loops = Object.entries(LOOP_LABELS);
  const loopsOn = loops.filter(([key]) => s.flags[key]).length;
  const quietOff = s.quiet_hours_start === s.quiet_hours_end;

  return (
    <div className="space-y-6">
      <Warnings items={s.warnings} />

      {!isAdmin && (
        <Alert>
          <Lock />
          <AlertTitle>View only</AlertTitle>
          <AlertDescription>Only organization admins can change these settings.</AlertDescription>
        </Alert>
      )}

      <Panel
        icon={Workflow}
        title="Loops"
        description={
          s.agent_enabled
            ? "Each loop runs only while its switch is on. Turning one off stops its sends at the next step. Switches save as soon as you flip them."
            : "The master switch (TALENT_AGENT_ENABLED) is off on the server, so nothing runs whatever these say."
        }
        action={
          s.agent_enabled ? (
            <Pill tone={loopsOn ? "green" : "gray"}>{`${loopsOn} of ${loops.length} on`}</Pill>
          ) : (
            <Pill tone="red">Master switch off</Pill>
          )
        }
      >
        <div>
          {loops.map(([key, { label, help }], i) => {
            const Icon = LOOP_ICONS[key] ?? Workflow;
            const on = !!s.flags[key];
            return (
              <React.Fragment key={key}>
                {i > 0 && <Separator />}
                <div className={cn("flex items-start gap-3 py-3.5", i === 0 && "pt-0", i === loops.length - 1 && "pb-0")}>
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
                      on && s.agent_enabled && "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor={`loop-${key}`} className="leading-snug text-foreground">
                      {label}
                    </Label>
                    <p id={`loop-${key}-help`} className="text-xs text-muted-foreground">
                      {help}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5 pt-0.5">
                    <span className="w-7 text-right text-xs font-medium text-muted-foreground" aria-hidden>
                      {busyFlag === key ? <Loader2 className="ml-auto size-3.5 animate-spin" /> : on ? "On" : "Off"}
                    </span>
                    <Switch
                      id={`loop-${key}`}
                      aria-describedby={`loop-${key}-help`}
                      checked={on}
                      disabled={!isAdmin || saving}
                      onCheckedChange={(v) => toggleLoop(key, v)}
                    />
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel icon={Send} title="Outreach" description="When and how much the agent may send.">
          <div className="space-y-6">
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
                <UnitInput
                  id="settings-quiet-start"
                  unit=":00"
                  type="number"
                  min={0}
                  max={23}
                  disabled={!isAdmin}
                  value={s.quiet_hours_start}
                  onChange={(e) => set("quiet_hours_start", Number(e.target.value))}
                />
              </Field>
              <Field id="settings-quiet-end" label="Quiet hours end (local hour)" help="Same start and end turns quiet hours off.">
                <UnitInput
                  id="settings-quiet-end"
                  unit=":00"
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
            <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Info aria-hidden className="mt-px size-3.5 shrink-0" />
              <span>
                {quietOff
                  ? "Quiet hours are off — sends may go out at any hour."
                  : `Nothing is sent between ${hour(s.quiet_hours_start)} and ${hour(s.quiet_hours_end)} (${s.timezone || "local time"}).`}
              </span>
            </div>

            <Separator />

            <div className="space-y-3">
              <SubHeading title="Daily send cap ramp" description="A new domain starts low and earns volume." />
              <div className="space-y-2">
                {s.send_ramp.map((step, i) => (
                  <div key={i} className="grid grid-cols-[1.75rem_1fr_1fr] items-end gap-3">
                    <Badge variant="outline" className="mb-3 size-7 justify-center rounded-full p-0 tabular-nums text-muted-foreground" aria-hidden>
                      {i + 1}
                    </Badge>
                    <Field id={`settings-ramp-from-${i}`} label="From day" hideLabel={i > 0}>
                      <Input
                        id={`settings-ramp-from-${i}`}
                        type="number"
                        min={0}
                        className="tabular-nums"
                        disabled={!isAdmin || i === 0}
                        value={step.from_day}
                        onChange={(e) =>
                          set("send_ramp", s.send_ramp.map((x, j) => (j === i ? { ...x, from_day: Number(e.target.value) } : x)))
                        }
                      />
                    </Field>
                    <Field id={`settings-ramp-cap-${i}`} label="Messages per day" hideLabel={i > 0}>
                      <UnitInput
                        id={`settings-ramp-cap-${i}`}
                        unit="/ day"
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
            </div>
          </div>
        </Panel>

        <Panel
          icon={UsersRound}
          title="Candidates"
          description="Freshness, retention and what candidates are told."
          action={
            retention ? (
              <Pill tone={retention.due ? "amber" : "green"}>{`${retention.due.toLocaleString()} past retention`}</Pill>
            ) : undefined
          }
        >
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="settings-refresh-days" label="Ask to update every (days)" help="90 = every 3 months (30 to 730).">
                <UnitInput
                  id="settings-refresh-days"
                  unit="days"
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
                <UnitInput
                  id="settings-retention"
                  unit="months"
                  aria-describedby="settings-retention-help"
                  type="number"
                  min={1}
                  max={120}
                  disabled={!isAdmin}
                  value={s.retention_months}
                  onChange={(e) => set("retention_months", Number(e.target.value))}
                />
              </Field>
              <Field
                id="settings-autonomy"
                label="Default autonomy for new jobs"
                help="Copilot: you approve invites. Submissions and rejections always need you."
                className="sm:col-span-2"
              >
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

            <Separator />

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

      <EmailBranding branding={s.branding} isAdmin={isAdmin} onSaved={(out) => absorb(out, false)} />

      <Panel
        icon={Cpu}
        title="Models"
        description={
          s.ai_provider === "anthropic"
            ? "Claude serves the agent (TALENT_LLM_PROVIDER=anthropic, models in TALENT_*_MODEL). Set on the server."
            : "Your own Ollama server serves the agent — no Anthropic credits are used (TALENT_LLM_PROVIDER, TALENT_OLLAMA_MODEL, EMBEDDING_PROVIDER on the server)."
        }
        action={<Pill tone={s.ai_provider === "anthropic" ? "blue" : "green"}>{s.ai_provider === "anthropic" ? "Claude" : "Ollama"}</Pill>}
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {[...Object.entries(s.models), ["embeddings", s.embedding_provider ?? "off"] as [string, string]].map(([k, v]) => (
            <div key={k} className="min-w-0 rounded-lg border bg-muted/30 px-3 py-2.5">
              <dt className="text-xs tracking-wide text-muted-foreground uppercase">{k.replace(/_/g, " ")}</dt>
              <dd className="mt-1 truncate font-mono text-foreground" title={v}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>

      {isAdmin && (
        <div className="sticky bottom-4 z-20">
          <div className="flex flex-col gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2.5">
              {dirty ? <Pill tone="amber">Unsaved changes</Pill> : <Pill tone="green">All changes saved</Pill>}
              <span className="hidden text-xs text-muted-foreground md:inline">
                Outreach and candidate settings save here; loop switches and email branding save on their own.
              </span>
            </div>
            <div className="flex shrink-0 justify-end gap-2">
              {dirty && (
                <Button variant="ghost" disabled={saving} onClick={discard}>
                  <RotateCcw /> Discard
                </Button>
              )}
              <Button variant="primary" disabled={saving} onClick={() => save()}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />} Save settings
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TalentSettingsView() {
  return (
    <TalentShell icon={Settings} title="Talent Agent settings" subtitle="Switches, limits and candidate-facing text for your organization.">
      <SettingsBody />
    </TalentShell>
  );
}
