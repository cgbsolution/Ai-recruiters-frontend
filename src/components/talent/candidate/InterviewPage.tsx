"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Bot, CalendarClock, CheckCircle2, Loader2, UserRound } from "lucide-react";
import { ApiError } from "@/lib/api";
import { fmtDate, publicGet, publicPost, type InterviewState } from "@/lib/talent";
import { cn } from "@/lib/utils";
import { Card, CandidateFrame, LinkProblem, PrimaryButton, SecondaryButton } from "./CandidateFrame";
import { InterviewRunner } from "./InterviewRunner";

function Disclosure({ text }: { text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-brand-100 bg-brand-25 p-4 text-sm text-gray-700">
      <Bot className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
      <p>{text}</p>
    </div>
  );
}

export default function InterviewPage({ token }: { token: string }) {
  const base = `/interview/${encodeURIComponent(token)}`;
  const [s, setS] = useState<InterviewState | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null>(null);

  const load = useCallback(() => {
    publicGet<InterviewState>(base).then(setS).catch(() => setGone(true));
  }, [base]);

  useEffect(load, [load]);

  if (gone) return <LinkProblem />;
  if (!s) {
    return (
      <CandidateFrame>
        <div className="flex justify-center py-20 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </CandidateFrame>
    );
  }

  const act = async (path: string, body: unknown = {}) => {
    setError(null);
    setBusy(true);
    try {
      setS(await publicPost<InterviewState>(`${base}${path}`, body));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Something went wrong. Please try again.");
      load();
    } finally {
      setBusy(false);
    }
  };

  if (s.status === "in_progress" || (s.status === "scheduled" && s.can_start)) {
    return <InterviewRunner token={token} state={s} onDone={load} />;
  }

  const human = (
    <button type="button" disabled={busy} onClick={() => act("/human")}
      className="mt-4 inline-flex items-center gap-1.5 text-sm text-gray-600 underline-offset-2 hover:underline">
      <UserRound className="h-4 w-4" /> I&apos;d rather talk to a person
    </button>
  );

  return (
    <CandidateFrame org={s.organization}>
      <h1 className="text-2xl font-semibold tracking-tight">Interview · {s.job_title}</h1>
      <p className="mt-1 text-sm text-gray-600">
        About {s.question_count} questions, up to {s.time_limit_minutes} minutes.{" "}
        {s.mode === "async_voice" ? "Answer by speaking or typing." : s.mode === "async_text" ? "Answer in writing." : "A live voice conversation."}
      </p>
      <div className="mt-5">
        <Disclosure text={s.disclosure} />
      </div>

      {s.status === "offered" && (
        <Card className="mt-4">
          <div className="text-sm font-medium text-gray-800">Pick a time</div>
          {s.slots.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">We&apos;re finding times that work — a recruiter will be in touch.</p>
          ) : (
            <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Interview times">
              {s.slots.map((slot) => (
                <button key={slot.id} type="button" role="radio" aria-checked={choice === slot.id} onClick={() => setChoice(slot.id)}
                  className={cn("flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm",
                    choice === slot.id ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:bg-gray-50")}>
                  <CalendarClock className="h-4 w-4 text-gray-500" aria-hidden />
                  {slot.label}
                </button>
              ))}
            </div>
          )}
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          {s.slots.length > 0 && (
            <PrimaryButton className="mt-4 w-full" disabled={!choice || busy} onClick={() => act("/book", { slot_id: choice })}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Book this time
            </PrimaryButton>
          )}
          {human}
        </Card>
      )}

      {s.status === "scheduled" && (
        <Card className="mt-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden />
            <div>
              <div className="font-medium">Booked for {s.scheduled_label}</div>
              <p className="mt-1 text-sm text-gray-600">
                {s.mode === "live_voice" && s.meeting_link
                  ? "Join with the link we emailed you at that time."
                  : `Come back to this page then — it opens at ${fmtDate(s.opens_at, true)}. We'll remind you the day before and an hour before.`}
              </p>
            </div>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          {s.can_reschedule && (
            <SecondaryButton className="mt-4 w-full" disabled={busy} onClick={() => act("/reschedule")}>Choose another time</SecondaryButton>
          )}
          {human}
        </Card>
      )}

      {["human_requested", "no_show", "expired"].includes(s.status) && (
        <Card className="mt-4">
          <p className="text-sm text-gray-700">
            {s.status === "human_requested"
              ? "Thanks — a recruiter will contact you to arrange a conversation with a person."
              : "This interview time has passed. A recruiter will be in touch about next steps."}
          </p>
        </Card>
      )}

      {["completed", "scored"].includes(s.status) && (
        <Card className="mt-4 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">Interview submitted</h2>
          <p className="mt-2 text-sm text-gray-600">Thank you. A recruiter reviews every interview and will be in touch.</p>
        </Card>
      )}
    </CandidateFrame>
  );
}
