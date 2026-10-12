"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CircleAlert, Download, Loader2, ShieldOff, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { fmtDate, publicGet, publicPost, publicUrl } from "@/lib/talent";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { type Brand, CandidateFrame, LinkProblem } from "./CandidateFrame";

interface Consent {
  channel: string;
  purpose: string;
  status: string;
}

interface MyData {
  organization: string;
  brand?: Brand;
  profile: Record<string, string | number | null>;
  consents: Consent[];
  cv_versions: { version: number; received_at: string; source: string; current: boolean }[];
  messages: { kind: string; channel: string; sent_at: string }[];
  applications: { job: string; status: string; updated_at: string }[];
  interviews: { job: string; mode: string; status: string; completed_at: string | null; recorded: boolean }[];
}

const PURPOSES: Record<string, string> = {
  refresh: "Keeping your profile up to date",
  jobs: "Roles that match your profile",
  interview: "Arranging interviews",
};

const PROFILE_LABELS: Record<string, string> = {
  name: "Name", email: "Email", phone: "Phone", current_designation: "Role", current_company: "Company",
  location: "Location", current_ctc: "Current salary (LPA)", expected_ctc: "Expected salary (LPA)",
  notice_period_days: "Notice period (days)", job_search_status: "Looking for a role", last_verified_at: "Last confirmed",
  keep_until: "We keep it until",
};

const KIND_LABELS: Record<string, string> = {
  refresh_touch_1: "Profile check", refresh_touch_2: "Profile check reminder", refresh_touch_3: "Profile check, last reminder",
  invite: "Role invitation", invite_reminder: "Role invitation reminder", interview_offer: "Interview times",
  interview_confirmed: "Interview confirmation", interview_reminder_24h: "Interview reminder", interview_reminder_1h: "Interview reminder",
  interview_missed: "Missed interview", not_moving_forward: "Application update",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function MyDataPage({ token }: { token: string }) {
  const [data, setData] = useState<MyData | null>(null);
  const [gone, setGone] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/my-data/${encodeURIComponent(token)}`;

  const load = useCallback(() => {
    publicGet<MyData>(base).then(setData).catch(() => setGone(true));
  }, [base]);

  useEffect(load, [load]);

  if (deleted) {
    return (
      <CandidateFrame>
        <Card>
          <CardHeader>
            <CardTitle className="leading-snug">
              <h1 className="text-lg font-semibold">Your data has been deleted</h1>
            </CardTitle>
            <CardDescription className="mt-1 text-gray-600">
              We removed your profile, every CV we held, and any interview recordings and transcripts. We keep only a
              scrambled fingerprint of your email and phone so we never contact you again.
            </CardDescription>
          </CardHeader>
        </Card>
      </CandidateFrame>
    );
  }
  if (gone) return <LinkProblem />;
  if (!data) {
    return (
      <CandidateFrame>
        <div className="flex justify-center py-20 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </CandidateFrame>
    );
  }

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const consentOn = (channel: string, purpose: string) =>
    data.consents.some((c) => c.channel === channel && c.purpose === purpose && c.status === "granted");

  return (
    <CandidateFrame org={data.organization} brand={data.brand}>
      <h1 className="text-2xl font-semibold tracking-tight">Your data</h1>
      <p className="mt-2 text-sm text-gray-600">
        Everything {data.organization || "we"} hold about you, and controls for it.
      </p>

      <div className="mt-6 space-y-4">
        <Section title="Profile">
          <dl className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-1.5 text-sm">
            {Object.entries(data.profile)
              .filter(([, v]) => v !== null && v !== "")
              .map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className="text-gray-500">{PROFILE_LABELS[k] ?? k}</dt>
                  <dd className="break-words text-gray-900">{k.endsWith("_at") || k === "keep_until" ? fmtDate(String(v)) : String(v)}</dd>
                </React.Fragment>
              ))}
          </dl>
        </Section>

        <Section title="What we may contact you about">
          <div className="space-y-3">
            {Object.entries(PURPOSES).map(([purpose, label]) => (
              <div key={purpose} className="flex items-center justify-between gap-3">
                <Label htmlFor={`consent-email-${purpose}`} className="font-normal leading-snug">
                  {label} (email)
                </Label>
                <Switch
                  id={`consent-email-${purpose}`}
                  checked={consentOn("email", purpose)}
                  disabled={busy !== null}
                  onCheckedChange={(checked) =>
                    act(`c-${purpose}`, async () => {
                      await publicPost(`${base}/consent`, { channel: "email", purpose, granted: checked });
                      load();
                    })
                  }
                />
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="mt-4 h-auto min-h-10 w-full whitespace-normal py-2.5"
            disabled={busy !== null}
            onClick={() => act("withdraw", async () => { await publicPost(`${base}/withdraw-all`, {}); load(); })}
          >
            <ShieldOff className="h-4 w-4" /> Withdraw all consent and stop every message
          </Button>
        </Section>

        <Section title="CVs we hold">
          <ul className="space-y-1 text-sm text-gray-700">
            {data.cv_versions.map((v) => (
              <li key={v.version}>
                Version {v.version}, received {fmtDate(v.received_at)}{v.current ? " (current)" : ""}
              </li>
            ))}
            {data.cv_versions.length === 0 && <li className="text-gray-500">Your original CV.</li>}
          </ul>
        </Section>

        {(data.applications.length > 0 || data.interviews.length > 0) && (
          <Section title="Roles and interviews">
            <ul className="space-y-1 text-sm text-gray-700">
              {data.applications.map((a, i) => (
                <li key={`a${i}`}>{a.job}: {a.status.replace(/_/g, " ")}</li>
              ))}
              {data.interviews.map((iv, i) => (
                <li key={`i${i}`}>
                  Interview for {iv.job}: {iv.status.replace(/_/g, " ")}{iv.recorded ? " (recorded)" : ""}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Messages we've sent you">
          <ul className="space-y-1 text-sm text-gray-700">
            {data.messages.map((m, i) => (
              <li key={i}>{fmtDate(m.sent_at)} · {KIND_LABELS[m.kind] ?? m.kind} ({m.channel})</li>
            ))}
            {data.messages.length === 0 && <li className="text-gray-500">None yet.</li>}
          </ul>
        </Section>

        <Button asChild variant="outline" size="lg" className="w-full">
          <a href={publicUrl(`${base}/export`)}>
            <Download className="h-4 w-4" /> Download everything (JSON)
          </a>
        </Button>

        <Card className="gap-3 border-red-200">
          <CardHeader>
            <CardTitle>
              <h2 className="text-sm font-semibold text-red-700">Delete everything</h2>
            </CardTitle>
            <CardDescription className="mt-1 text-gray-600">
              Removes your profile, all CVs, and any interview recordings and transcripts. This can't be undone. Type
              DELETE to confirm.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" />
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="w-full"
              disabled={confirm.trim().toUpperCase() !== "DELETE" || busy !== null}
              onClick={() => act("delete", async () => { await publicPost(`${base}/delete`, { confirm }); setDeleted(true); })}
            >
              <Trash2 className="h-4 w-4" /> Delete my data
            </Button>
          </CardContent>
        </Card>
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </CandidateFrame>
  );
}
