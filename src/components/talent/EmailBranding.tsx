"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { notifyError, notifySuccess } from "@/lib/notify";
import { type Branding, type EmailPreview, type TalentSettings, talentGet, talentPut } from "@/lib/talent";
import { Panel } from "./TalentShell";

const HEX = /^#[0-9a-fA-F]{6}$/;

type Form = Pick<Branding, "brand_name" | "brand_logo_url" | "brand_color" | "email_signature" | "refresh_message">;
const TOUCHES = [
  { n: 1, label: "First email" },
  { n: 2, label: "Reminder (3 days)" },
  { n: 3, label: "Last reminder (7 days)" },
];

/** Label + control + optional help. The control must carry `id` and `aria-describedby={`${id}-help`}` when there is help. */
function Field({ id, label, help, children }: { id: string; label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {help && (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
    </div>
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
            <Field id="branding-name" label="Sender name" help={`Shown as the From name. Default: ${branding.default_name}.`}>
              <Input
                id="branding-name"
                aria-describedby="branding-name-help"
                disabled={!isAdmin}
                maxLength={120}
                placeholder={branding.default_name}
                value={form.brand_name ?? ""}
                onChange={(e) => set("brand_name", e.target.value)}
              />
            </Field>
            <Field id="branding-color" label="Brand colour" help={colorOk ? "Buttons and the header line." : "Use the form #465FFF."}>
              <div className="flex gap-2">
                <Input
                  type="color"
                  aria-label="Pick brand colour"
                  disabled={!isAdmin}
                  className="w-12 shrink-0 cursor-pointer p-1"
                  value={form.brand_color && HEX.test(form.brand_color) ? form.brand_color : branding.default_color}
                  onChange={(e) => set("brand_color", e.target.value)}
                />
                <Input
                  id="branding-color"
                  aria-describedby="branding-color-help"
                  aria-invalid={!colorOk}
                  disabled={!isAdmin}
                  maxLength={7}
                  placeholder={branding.default_color}
                  value={form.brand_color ?? ""}
                  onChange={(e) => set("brand_color", e.target.value.trim())}
                />
              </div>
            </Field>
          </div>
          <Field
            id="branding-logo"
            label="Logo URL"
            help={logoOk ? "An https:// link to a PNG or JPG, about 200×40 px. Leave empty to show the name instead." : "The logo must be an https:// link."}
          >
            <Input
              id="branding-logo"
              aria-describedby="branding-logo-help"
              aria-invalid={!logoOk}
              disabled={!isAdmin}
              maxLength={500}
              placeholder="https://…/logo.png"
              value={form.brand_logo_url ?? ""}
              onChange={(e) => set("brand_logo_url", e.target.value.trim())}
            />
          </Field>
          <Field id="branding-message" label="Opening message (first email)" help="Your own words, in place of the standard opening. Up to 800 characters.">
            <Textarea
              id="branding-message"
              aria-describedby="branding-message-help"
              rows={3}
              className="min-h-20"
              disabled={!isAdmin}
              maxLength={800}
              placeholder="It's been a few months since your profile was last updated…"
              value={form.refresh_message ?? ""}
              onChange={(e) => set("refresh_message", e.target.value)}
            />
          </Field>
          <Field id="branding-signature" label="Sign-off" help="One or two lines, e.g. a name and team.">
            <Textarea
              id="branding-signature"
              aria-describedby="branding-signature-help"
              rows={2}
              disabled={!isAdmin}
              maxLength={300}
              placeholder={`The ${form.brand_name || branding.default_name} talent team`}
              value={form.email_signature ?? ""}
              onChange={(e) => set("email_signature", e.target.value)}
            />
          </Field>
          {isAdmin && (
            <div className="flex justify-end">
              <Button variant="primary" size="lg" disabled={saving || !colorOk || !logoOk} onClick={save}>
                <Save /> Save branding
              </Button>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          <Tabs value={String(touch)} onValueChange={(v) => setTouch(Number(v))} className="gap-3">
            <TabsList aria-label="Email to preview" className="max-w-full justify-start overflow-x-auto">
              {TOUCHES.map((t) => (
                <TabsTrigger key={t.n} value={String(t.n)}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {/* One panel for whichever tab is active: the preview is fetched per tab. */}
            <TabsContent value={String(touch)} className="min-w-0">
              {preview ? (
                <Card className="gap-0 overflow-hidden py-0 shadow-none">
                  <CardHeader className="grid-cols-[minmax(0,1fr)] gap-0.5 border-b bg-muted/50 px-4 py-2.5 [.border-b]:pb-2.5">
                    <CardDescription className="text-xs">
                      From <span className="font-medium text-foreground">{preview.from_name}</span>
                    </CardDescription>
                    <CardTitle className="truncate text-sm leading-normal">{preview.subject}</CardTitle>
                  </CardHeader>
                  {/* sandbox="" — no scripts, no navigation: it's only for looking. */}
                  <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[520px] w-full bg-white" />
                </Card>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">Preview unavailable.</div>
              )}
            </TabsContent>
          </Tabs>
          <p className="text-xs text-muted-foreground">
            Sample candidate shown. Real emails list each person&apos;s own role, top skills and last update, and link to
            their personal page, where they can upload their latest CV (PDF or DOCX, checked before it&apos;s stored).
            Sent every {preview?.refresh_after_days ?? 90} days, at most 3 messages per round.
          </p>
        </div>
      </div>
    </Panel>
  );
}
