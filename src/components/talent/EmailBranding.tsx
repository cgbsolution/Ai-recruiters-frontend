"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@/lib/notify";
import { type Branding, type EmailPreview, type TalentSettings, talentGet, talentPut } from "@/lib/talent";
import { cn } from "@/lib/utils";
import { Panel } from "./TalentShell";

const input =
  "h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 disabled:opacity-60 dark:border-white/10 dark:bg-gray-900 dark:text-gray-100";
const HEX = /^#[0-9a-fA-F]{6}$/;

type Form = Pick<Branding, "brand_name" | "brand_logo_url" | "brand_color" | "email_signature" | "refresh_message">;
const TOUCHES = [
  { n: 1, label: "First email" },
  { n: 2, label: "Reminder (3 days)" },
  { n: 3, label: "Last reminder (7 days)" },
];

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
      {children}
      {help && <span className="block text-xs text-gray-500 dark:text-gray-400">{help}</span>}
    </label>
  );
}

/** How the profile-update emails look for this organization, with a live preview
 *  rendered by the server (exactly what candidates receive, minus their links). */
export function EmailBranding({
  branding,
  isAdmin,
  onSaved,
}: {
  branding: Branding;
  isAdmin: boolean;
  onSaved: (s: TalentSettings) => void;
}) {
  const [form, setForm] = useState<Form>(branding);
  const [touch, setTouch] = useState(1);
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [saving, setSaving] = useState(false);

  const loadPreview = useCallback(
    (n: number) => talentGet<EmailPreview>(`/settings/email-preview?touch=${n}`).then(setPreview).catch(() => setPreview(null)),
    [],
  );
  useEffect(() => {
    loadPreview(touch);
  }, [touch, loadPreview]);

  const set = (k: keyof Form, v: string) => setForm({ ...form, [k]: v });
  const colorOk = !form.brand_color || HEX.test(form.brand_color);
  const logoOk = !form.brand_logo_url || form.brand_logo_url.startsWith("https://");

  const save = async () => {
    setSaving(true);
    try {
      const out = await talentPut<TalentSettings>("/settings", {
        brand_name: form.brand_name ?? "",
        brand_logo_url: form.brand_logo_url ?? "",
        brand_color: form.brand_color ?? "",
        email_signature: form.email_signature ?? "",
        refresh_message: form.refresh_message ?? "",
      });
      onSaved(out);
      setForm(out.branding);
      await loadPreview(touch);
      notifySuccess("Email branding saved");
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title="Email branding"
      description="How the profile-update emails look to candidates. Empty fields use your organization's name and the default colour."
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sender name" help={`Shown as the From name. Default: ${branding.default_name}.`}>
              <input className={input} disabled={!isAdmin} maxLength={120} placeholder={branding.default_name}
                value={form.brand_name ?? ""} onChange={(e) => set("brand_name", e.target.value)} />
            </Field>
            <Field label="Brand colour" help={colorOk ? "Buttons and the header line." : "Use the form #465FFF."}>
              <div className="flex gap-2">
                <input type="color" aria-label="Pick brand colour" disabled={!isAdmin}
                  className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-gray-200 bg-white p-1 dark:border-white/10 dark:bg-gray-900"
                  value={form.brand_color && HEX.test(form.brand_color) ? form.brand_color : branding.default_color}
                  onChange={(e) => set("brand_color", e.target.value)} />
                <input className={cn(input, !colorOk && "border-error-500")} disabled={!isAdmin} maxLength={7}
                  placeholder={branding.default_color} value={form.brand_color ?? ""}
                  onChange={(e) => set("brand_color", e.target.value.trim())} />
              </div>
            </Field>
          </div>
          <Field label="Logo URL" help={logoOk ? "An https:// link to a PNG or JPG, about 200×40 px. Leave empty to show the name instead." : "The logo must be an https:// link."}>
            <input className={cn(input, !logoOk && "border-error-500")} disabled={!isAdmin} maxLength={500}
              placeholder="https://…/logo.png" value={form.brand_logo_url ?? ""}
              onChange={(e) => set("brand_logo_url", e.target.value.trim())} />
          </Field>
          <Field label="Opening message (first email)" help="Your own words, in place of the standard opening. Up to 800 characters.">
            <textarea rows={3} className={`${input} h-auto py-2`} disabled={!isAdmin} maxLength={800}
              placeholder="It's been a few months since your profile was last updated…"
              value={form.refresh_message ?? ""} onChange={(e) => set("refresh_message", e.target.value)} />
          </Field>
          <Field label="Sign-off" help="One or two lines, e.g. a name and team.">
            <textarea rows={2} className={`${input} h-auto py-2`} disabled={!isAdmin} maxLength={300}
              placeholder={`The ${form.brand_name || branding.default_name} talent team`}
              value={form.email_signature ?? ""} onChange={(e) => set("email_signature", e.target.value)} />
          </Field>
          {isAdmin && (
            <div className="flex justify-end">
              <Button variant="primary" className="h-10 py-0" disabled={saving || !colorOk || !logoOk} onClick={save}>
                <Save /> Save branding
              </Button>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Email to preview">
            {TOUCHES.map((t) => (
              <button key={t.n} type="button" role="tab" aria-selected={touch === t.n} onClick={() => setTouch(t.n)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium",
                  touch === t.n
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5",
                )}>
                {t.label}
              </button>
            ))}
          </div>
          {preview ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
              <div className="space-y-0.5 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                <div className="text-gray-500 dark:text-gray-400">
                  From <span className="font-medium text-gray-800 dark:text-gray-200">{preview.from_name}</span>
                </div>
                <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">{preview.subject}</div>
              </div>
              {/* sandbox="" — no scripts, no navigation: it's only for looking. */}
              <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[520px] w-full bg-white" />
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-gray-500">Preview unavailable.</div>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Sample candidate shown. Real emails list each person&apos;s own role, top skills and last update, and link to
            their personal page, where they can upload their latest CV (PDF or DOCX, checked before it&apos;s stored).
            Sent every {preview?.refresh_after_days ?? 90} days, at most 3 messages per round.
          </p>
        </div>
      </div>
    </Panel>
  );
}
