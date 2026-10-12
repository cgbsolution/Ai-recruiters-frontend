"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { publicGet, publicPost, type InvitePageData } from "@/lib/talent";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CandidateFrame, LinkProblem } from "./CandidateFrame";

export default function InvitePage({ token }: { token: string }) {
  const [data, setData] = useState<InvitePageData | null>(null);
  const [gone, setGone] = useState(false);
  const [f, setF] = useState({ current_ctc: "", expected_ctc: "", notice_period_days: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    publicGet<InvitePageData>(`/invite/${encodeURIComponent(token)}`)
      .then((d) => {
        setData(d);
        setF({
          current_ctc: d.current.current_ctc?.toString() ?? "",
          expected_ctc: d.current.expected_ctc?.toString() ?? "",
          notice_period_days: d.current.notice_period_days?.toString() ?? "",
        });
      })
      .catch(() => setGone(true));
  }, [token]);

  if (gone) return <LinkProblem />;
  if (!data) {
    return (
      <CandidateFrame>
        <div className="flex justify-center py-20 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </CandidateFrame>
    );
  }
  if (declined) {
    return (
      <CandidateFrame org={data.organization} brand={data.brand}>
        <Card>
          <CardContent className="text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
            <h1 className="mt-3 text-lg font-semibold">Thanks for letting us know</h1>
            <p className="mt-2 text-sm text-gray-600">We won&apos;t contact you about this role again.</p>
          </CardContent>
        </Card>
      </CandidateFrame>
    );
  }

  const answer = async (interested: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const num = (v: string) => (v.trim() === "" ? null : Number(v));
      const r = await publicPost<{ interview_url?: string }>(`/invite/${encodeURIComponent(token)}`, {
        interested,
        current_ctc: num(f.current_ctc),
        expected_ctc: num(f.expected_ctc),
        notice_period_days: num(f.notice_period_days),
      });
      if (interested && r.interview_url) window.location.href = r.interview_url;
      else setDeclined(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setGone(true);
      else setError(e instanceof ApiError ? e.detail : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CandidateFrame org={data.organization} brand={data.brand}>
      <h1 className="text-2xl font-semibold tracking-tight">{data.job.title}</h1>
      <p className="mt-1 text-sm text-gray-600">
        {[data.job.location, data.job.type, data.job.experience].filter(Boolean).join(" · ")}
      </p>
      <Card className="mt-6">
        <CardContent>
          <p className="text-sm leading-6 text-gray-700">{data.job.summary}</p>
        </CardContent>
      </Card>
      {!data.open ? (
        <Card className="mt-4">
          <CardContent>
            <p className="text-sm text-gray-600">This role is no longer open. Thank you for your interest.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mt-4 gap-4">
            <CardHeader>
              <CardTitle className="text-sm font-medium leading-snug text-gray-800">If you&apos;re interested, please confirm</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid content-end gap-2">
                  <Label htmlFor="invite-current-ctc" className="font-normal leading-snug text-gray-700">Current salary (LPA)</Label>
                  <Input id="invite-current-ctc" type="number" min={0} step="0.1" value={f.current_ctc}
                    onChange={(e) => setF({ ...f, current_ctc: e.target.value })} />
                </div>
                <div className="grid content-end gap-2">
                  <Label htmlFor="invite-expected-ctc" className="font-normal leading-snug text-gray-700">Expected salary (LPA)</Label>
                  <Input id="invite-expected-ctc" type="number" min={0} step="0.1" value={f.expected_ctc}
                    onChange={(e) => setF({ ...f, expected_ctc: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="invite-notice" className="font-normal leading-snug text-gray-700">Notice period (days)</Label>
                <Input id="invite-notice" type="number" min={0} max={365} value={f.notice_period_days}
                  onChange={(e) => setF({ ...f, notice_period_days: e.target.value })} />
              </div>
              <p className="text-xs text-gray-500">
                Next you&apos;ll pick a time for a short first-round interview with an AI interviewer. You can ask for a person instead.
              </p>
            </CardContent>
          </Card>
          {error && (
            <Alert variant="destructive" className="mt-3">
              <CircleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button type="button" variant="primary" size="lg" className="w-full" disabled={busy} onClick={() => answer(true)}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} I&apos;m interested
            </Button>
            <Button type="button" variant="outline" size="lg" className="w-full" disabled={busy} onClick={() => answer(false)}>
              Not interested
            </Button>
          </div>
        </>
      )}
    </CandidateFrame>
  );
}
