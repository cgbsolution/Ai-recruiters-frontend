"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { publicGet, publicPost, publicUpload } from "@/lib/talent";
import { Card, CandidateFrame, LinkProblem, PrimaryButton, inputClass } from "./CandidateFrame";

interface RefreshData {
  organization: string;
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

const SEARCH = [
  { v: "active", l: "Actively looking" },
  { v: "open", l: "Open to the right role" },
  { v: "not_looking", l: "Not looking right now" },
];

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-gray-800">
      {children}
    </label>
  );
}

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
      <CandidateFrame org={data.organization}>
        <Card className="text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">Thank you — your profile is up to date</h1>
          <p className="mt-2 text-sm text-gray-600">
            {f.job_search_status === "not_looking"
              ? "We won't suggest roles while you're not looking. You can change that any time from the link in our emails."
              : "We'll only contact you about roles that fit what you told us."}
          </p>
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

  return (
    <CandidateFrame org={data.organization}>
      <h1 className="text-2xl font-semibold tracking-tight">
        {data.first_name ? `Hi ${data.first_name}, is this still right?` : "Is your profile still right?"}
      </h1>
      <p className="mt-2 text-sm text-gray-600">Check the details below, change anything that's out of date, and confirm. It takes about a minute.</p>

      <form onSubmit={submit} className="mt-6 space-y-5">
        <Card className="space-y-4">
          <div>
            <Label htmlFor="role">Current role</Label>
            <input id="role" className={inputClass} value={f.current_designation ?? ""} onChange={(e) => set("current_designation", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="company">Current company</Label>
            <input id="company" className={inputClass} value={f.current_company ?? ""} onChange={(e) => set("current_company", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="location">Where you're based</Label>
            <input id="location" className={inputClass} value={f.location ?? ""} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ctc">Current salary (LPA)</Label>
              <input id="ctc" type="number" min={0} max={1000} step="0.1" inputMode="decimal" className={inputClass}
                value={f.current_ctc ?? ""} onChange={(e) => set("current_ctc", num(e.target.value))} />
            </div>
            <div>
              <Label htmlFor="ectc">Expected salary (LPA)</Label>
              <input id="ectc" type="number" min={0} max={1000} step="0.1" inputMode="decimal" className={inputClass}
                value={f.expected_ctc ?? ""} onChange={(e) => set("expected_ctc", num(e.target.value))} />
            </div>
          </div>
          <div>
            <Label htmlFor="notice">Notice period</Label>
            <select id="notice" className={inputClass} value={f.notice_period_days ?? ""}
              onChange={(e) => set("notice_period_days", num(e.target.value))}>
              <option value="">Not sure</option>
              {NOTICE.map((n) => (
                <option key={n.v} value={n.v}>{n.l}</option>
              ))}
              {f.notice_period_days != null && !NOTICE.some((n) => n.v === f.notice_period_days) && (
                <option value={f.notice_period_days}>{f.notice_period_days} days</option>
              )}
            </select>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-gray-800">Are you looking for a new role?</legend>
            <div className="grid gap-2">
              {SEARCH.map((s) => (
                <label key={s.v} className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                  <input type="radio" name="search" value={s.v} checked={f.job_search_status === s.v} onChange={() => set("job_search_status", s.v)} className="accent-brand-500" />
                  {s.l}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={!!f.open_to_relocate}
              onChange={(e) => set("open_to_relocate", e.target.checked)} />
            I'm open to relocating
          </label>
        </Card>

        {skills.length > 0 && (
          <Card>
            <div className="text-sm font-medium text-gray-800">Skills from your CV</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {skills.map((s) => (
                <span key={s} className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-700">{s}</span>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-500">Out of date? Upload your latest CV below and we'll read it again.</p>
          </Card>
        )}

        <Card>
          <div className="text-sm font-medium text-gray-800">Newer CV (optional)</div>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="sr-only"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-4 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {uploaded ? `Uploaded: ${uploaded} — choose another` : "Upload a PDF or Word file"}
          </button>
        </Card>

        <Card className="space-y-3">
          <div className="text-sm font-medium text-gray-800">How we may contact you</div>
          <p className="text-xs leading-5 text-gray-500">{data.consent_text}</p>
          {(
            [
              ["refresh", "Ask me to keep this profile up to date (about twice a year)"],
              ["jobs", "Tell me about roles that match my profile"],
              ["interview", "Contact me to arrange interviews I agree to"],
              ["whatsapp", "You may also use WhatsApp for these"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-500" checked={consents[k]}
                onChange={(e) => setConsents({ ...consents, [k]: e.target.checked })} />
              {label}
            </label>
          ))}
        </Card>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <PrimaryButton type="submit" disabled={saving || uploading} className="w-full">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Confirm my profile
        </PrimaryButton>
      </form>
    </CandidateFrame>
  );
}
