"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { publicGet, publicPost, type InvitePageData } from "@/lib/talent";
import { Card, CandidateFrame, LinkProblem, PrimaryButton, SecondaryButton, inputClass } from "./CandidateFrame";

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
        <Card className="text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">Thanks for letting us know</h1>
          <p className="mt-2 text-sm text-gray-600">We won&apos;t contact you about this role again.</p>
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
        <p className="text-sm leading-6 text-gray-700">{data.job.summary}</p>
      </Card>
      {!data.open ? (
        <Card className="mt-4"><p className="text-sm text-gray-600">This role is no longer open. Thank you for your interest.</p></Card>
      ) : (
        <>
          <Card className="mt-4 space-y-4">
            <div className="text-sm font-medium text-gray-800">If you&apos;re interested, please confirm</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1.5 block text-gray-700">Current salary (LPA)</span>
                <input type="number" min={0} step="0.1" className={inputClass} value={f.current_ctc} onChange={(e) => setF({ ...f, current_ctc: e.target.value })} />
              </label>
              <label className="text-sm">
                <span className="mb-1.5 block text-gray-700">Expected salary (LPA)</span>
                <input type="number" min={0} step="0.1" className={inputClass} value={f.expected_ctc} onChange={(e) => setF({ ...f, expected_ctc: e.target.value })} />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1.5 block text-gray-700">Notice period (days)</span>
              <input type="number" min={0} max={365} className={inputClass} value={f.notice_period_days} onChange={(e) => setF({ ...f, notice_period_days: e.target.value })} />
            </label>
            <p className="text-xs text-gray-500">
              Next you&apos;ll pick a time for a short first-round interview with an AI interviewer. You can ask for a person instead.
            </p>
          </Card>
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <PrimaryButton disabled={busy} onClick={() => answer(true)}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} I&apos;m interested
            </PrimaryButton>
            <SecondaryButton disabled={busy} onClick={() => answer(false)}>Not interested</SecondaryButton>
          </div>
        </>
      )}
    </CandidateFrame>
  );
}
