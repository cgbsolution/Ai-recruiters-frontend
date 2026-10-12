"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, FileUp, Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { publicGet, publicPost, publicUpload } from "@/lib/talent";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Brand, CandidateFrame, LinkProblem } from "./CandidateFrame";

interface RefreshData {
  organization: string;
  brand: Brand;
  ask_every_months: number;
  first_name: string;
  fields: {
    current_designation: string | null;
    current_company: string | null;
    location: string | null;
    current_ctc: number | null;
    expected_ctc: number | null;
    notice_period_days: number | null;
    job_search_status: string | null;
    open_to_relocate: boolean | null;
  };
  skills: { name: string }[] | string[];
  consent_text: string;
  consents: { jobs: boolean; interview: boolean; refresh: boolean; whatsapp: boolean };
  new_cv_uploaded: boolean;
}

const NOTICE = [
  { v: 0, l: "Immediately" },
  { v: 15, l: "15 days" },
  { v: 30, l: "30 days" },
  { v: 45, l: "45 days" },
  { v: 60, l: "60 days" },
  { v: 90, l: "90 days" },
];

/** Select values can't be empty strings, so "Not sure" (no notice period) uses a sentinel. */
const NOTICE_UNSURE = "unsure";

const SEARCH = [
  { v: "active", l: "Actively looking" },
  { v: "open", l: "Open to the right role" },
  { v: "not_looking", l: "Not looking right now" },
];

const fieldLabel = "leading-snug text-gray-800";

export default function RefreshPage({ token }: { token: string }) {
  const [data, setData] = useState<RefreshData | null>(null);
  const [gone, setGone] = useState(false);
  const [f, setF] = useState<RefreshData["fields"] | null>(null);
  const [consents, setConsents] = useState<RefreshData["consents"]>({ jobs: false, interview: false, refresh: true, whatsapp: false });
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    publicGet<RefreshData>(`/refresh/${encodeURIComponent(token)}`)
      .then((d) => {
        setData(d);
        setF(d.fields);
        // The boxes show what the candidate has actually agreed to — never pre-ticked.
        setConsents(d.consents);
        if (d.new_cv_uploaded) setUploaded("Your new CV");
      })
      .catch(() => setGone(true));
  }, [token]);

  if (gone) return <LinkProblem />;
  if (!data || !f) {
    return (
      <CandidateFrame>
        <div className="flex justify-center py-20 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </CandidateFrame>
    );
  }

  if (done) {
    return (
      <CandidateFrame org={data.organization} brand={data.brand}>
        <Card>
          <CardContent className="text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
            <h1 className="mt-3 text-lg font-semibold">Thank you — your profile is up to date</h1>
            <p className="mt-2 text-sm text-gray-600">
              {f.job_search_status === "not_looking"
                ? "We won't suggest roles while you're not looking. You can change that any time from the link in our emails."
                : "We'll only contact you about roles that fit what you told us."}
            </p>
          </CardContent>
        </Card>
      </CandidateFrame>
    );
  }

  const set = (k: keyof RefreshData["fields"], v: string | number | boolean | null) => setF({ ...f, [k]: v });
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      await publicUpload(`/refresh/${encodeURIComponent(token)}/cv`, file);
      setUploaded(file.name);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Upload failed. Try a PDF or Word file under 10 MB.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await publicPost(`/refresh/${encodeURIComponent(token)}`, { fields: f, consents });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setGone(true);
      else setError(err instanceof ApiError ? err.detail : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const skills = (data.skills as (string | { name: string })[]).map((s) => (typeof s === "string" ? s : s.name));
  const customNotice = f.notice_period_days != null && !NOTICE.some((n) => n.v === f.notice_period_days);

  return (
    <CandidateFrame org={data.organization} brand={data.brand}>
      <h1 className="text-2xl font-semibold tracking-tight">
        {data.first_name ? `Hi ${data.first_name}, is this still right?` : "Is your profile still right?"}
      </h1>
      <p className="mt-2 text-sm text-gray-600">Check the details below, change anything that's out of date, and confirm. It takes about a minute.</p>

      <form onSubmit={submit} className="mt-6 space-y-5">
        <Card>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="role" className={fieldLabel}>Current role</Label>
              <Input id="role" value={f.current_designation ?? ""} onChange={(e) => set("current_designation", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="company" className={fieldLabel}>Current company</Label>
              <Input id="company" value={f.current_company ?? ""} onChange={(e) => set("current_company", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="location" className={fieldLabel}>Where you're based</Label>
              <Input id="location" value={f.location ?? ""} onChange={(e) => set("location", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid content-end gap-2">
                <Label htmlFor="ctc" className={fieldLabel}>Current salary (LPA)</Label>
                <Input id="ctc" type="number" min={0} max={1000} step="0.1" inputMode="decimal"
                  value={f.current_ctc ?? ""} onChange={(e) => set("current_ctc", num(e.target.value))} />
              </div>
              <div className="grid content-end gap-2">
                <Label htmlFor="ectc" className={fieldLabel}>Expected salary (LPA)</Label>
                <Input id="ectc" type="number" min={0} max={1000} step="0.1" inputMode="decimal"
                  value={f.expected_ctc ?? ""} onChange={(e) => set("expected_ctc", num(e.target.value))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notice" className={fieldLabel}>Notice period</Label>
              <Select
                value={f.notice_period_days == null ? NOTICE_UNSURE : String(f.notice_period_days)}
                onValueChange={(v) => set("notice_period_days", v === NOTICE_UNSURE ? null : num(v))}
              >
                <SelectTrigger id="notice" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOTICE_UNSURE}>Not sure</SelectItem>
                  {NOTICE.map((n) => (
                    <SelectItem key={n.v} value={String(n.v)}>{n.l}</SelectItem>
                  ))}
                  {customNotice && (
                    <SelectItem value={String(f.notice_period_days)}>{f.notice_period_days} days</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <fieldset>
              <legend id="search-legend" className="mb-2 text-sm font-medium text-gray-800">Are you looking for a new role?</legend>
              <RadioGroup
                name="search"
                aria-labelledby="search-legend"
                className="gap-2"
                value={f.job_search_status ?? ""}
                onValueChange={(v) => set("job_search_status", v)}
              >
                {SEARCH.map((s) => (
                  <Label key={s.v} htmlFor={`search-${s.v}`}
                    className="cursor-pointer gap-3 rounded-xl border border-gray-200 px-3 py-2.5 font-normal leading-snug has-[[data-state=checked]]:border-brand-500 has-[[data-state=checked]]:bg-brand-50">
                    <RadioGroupItem id={`search-${s.v}`} value={s.v} />
                    {s.l}
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>
            <div className="flex items-center gap-3">
              <Checkbox id="relocate" checked={!!f.open_to_relocate}
                onCheckedChange={(v) => set("open_to_relocate", v === true)} />
              <Label htmlFor="relocate" className="font-normal leading-snug">I'm open to relocating</Label>
            </div>
          </CardContent>
        </Card>

        {skills.length > 0 && (
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-800">Skills from your CV</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <Badge key={s} variant="secondary" className="max-w-full whitespace-normal break-words font-normal text-gray-700">{s}</Badge>
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-500">Out of date? Upload your latest CV below and we'll read it again.</p>
            </CardContent>
          </Card>
        )}

        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-800">Newer CV (optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <Input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="h-auto w-full whitespace-normal border-dashed py-4 font-normal text-gray-600">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {uploaded ? `Uploaded: ${uploaded} — choose another` : "Upload a PDF or Word file"}
              </span>
            </Button>
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-800">How we may contact you</CardTitle>
            <CardDescription className="text-xs leading-5 text-gray-500">{data.consent_text}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                ["refresh", `Ask me to keep this profile up to date (about every ${data.ask_every_months === 1 ? "month" : `${data.ask_every_months} months`})`],
                ["jobs", "Tell me about roles that match my profile"],
                ["interview", "Contact me to arrange interviews I agree to"],
                ["whatsapp", "You may also use WhatsApp for these"],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="flex items-start gap-3">
                <Checkbox id={`consent-${k}`} checked={consents[k]}
                  onCheckedChange={(v) => setConsents({ ...consents, [k]: v === true })} />
                <Label htmlFor={`consent-${k}`} className="font-normal leading-5">{label}</Label>
              </div>
            ))}
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={saving || uploading} className="w-full">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Confirm my profile
        </Button>
      </form>
    </CandidateFrame>
  );
}
