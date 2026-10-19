"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Bot, CalendarClock, CheckCircle2, CircleAlert, Loader2, UserRound } from "lucide-react";
import { ApiError } from "@/lib/api";
import { fmtDate, publicGet, publicPost, type InterviewState } from "@/lib/talent";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CandidateFrame, LinkProblem } from "./CandidateFrame";
import { InterviewRunner } from "./InterviewRunner";

function Disclosure({ text }: { text: string }) {
  return (
    <Alert role="note" className="border-brand-100 bg-brand-25 p-4 text-gray-700 [&>svg]:text-brand-500">
      <Bot aria-hidden />
      <AlertDescription className="text-gray-700">{text}</AlertDescription>
    </Alert>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="mt-3">
      <CircleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

type Day = InterviewState["availability"][number];

/** The next `bookingDays` days as a strip (days with no free time greyed out), then that day's times. */
function BookingCalendar({ days, bookingDays, day, time, onDay, onTime }: {
  days: Day[];
  bookingDays: number;
  day: string | null;
  time: string | null;
  onDay: (date: string) => void;
  onTime: (startsAt: string) => void;
}) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = new Date(`${days[0].date}T00:00:00`);
  const today = new Date();
  const start = today < first ? new Date(today.getFullYear(), today.getMonth(), today.getDate()) : first;
  const strip = Array.from({ length: bookingDays + 1 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { iso, d, open: byDate.has(iso) };
  });
  const selected = day ? byDate.get(day) : undefined;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8" role="radiogroup" aria-label="Interview date">
        {strip.map(({ iso, d, open }) => (
          <button key={iso} type="button" role="radio" aria-checked={day === iso} disabled={!open}
            onClick={() => onDay(iso)}
            className={cn(
              "flex flex-col items-center rounded-xl border px-1 py-2 text-xs transition-colors",
              open ? "border-gray-200 hover:bg-gray-50" : "cursor-not-allowed border-gray-100 text-gray-300",
              day === iso && "border-brand-500 bg-brand-50 text-brand-700 hover:bg-brand-50",
            )}>
            <span className="uppercase">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
            <span className="text-lg font-semibold leading-tight">{d.getDate()}</span>
            <span>{d.toLocaleDateString(undefined, { month: "short" })}</span>
          </button>
        ))}
      </div>
      {selected ? (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-sm text-gray-700">
            <CalendarClock className="h-4 w-4 text-gray-500" aria-hidden /> {selected.label}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Interview time">
            {selected.times.map((t) => (
              <button key={t.starts_at} type="button" role="radio" aria-checked={time === t.starts_at}
                onClick={() => onTime(t.starts_at)}
                className={cn(
                  "rounded-lg border border-gray-200 px-2 py-2 text-sm hover:bg-gray-50",
                  time === t.starts_at && "border-brand-500 bg-brand-50 font-medium text-brand-700 hover:bg-brand-50",
                )}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Choose a day to see the free times.</p>
      )}
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
  const [day, setDay] = useState<string | null>(null);

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
    <Button type="button" variant="link" disabled={busy} onClick={() => act("/human")}
      className="mt-4 h-auto justify-start gap-1.5 self-start px-0 font-normal text-gray-600 has-[>svg]:px-0">
      <UserRound className="h-4 w-4" /> I&apos;d rather talk to a person
    </Button>
  );

  return (
    <CandidateFrame org={s.organization} brand={s.brand}>
      <h1 className="text-2xl font-semibold tracking-tight">Interview · {s.job_title}</h1>
      <p className="mt-1 text-sm text-gray-600">
        About {s.question_count} questions, up to {s.time_limit_minutes} minutes.{" "}
        {s.mode === "async_voice" ? "Answer by speaking or typing." : s.mode === "async_text" ? "Answer in writing." : "A live voice conversation."}
      </p>
      <div className="mt-5">
        <Disclosure text={s.disclosure} />
      </div>

      {s.status === "offered" && (
        <Card className="mt-4 gap-3">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-800">Pick a date and time</CardTitle>
            <p className="text-xs text-gray-500">
              Any time in the next {s.booking_days} days. Times are in {s.time_zone}.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col">
            {s.availability.length === 0 ? (
              <p className="text-sm text-gray-600">We&apos;re finding times that work — a recruiter will be in touch.</p>
            ) : (
              <BookingCalendar
                days={s.availability}
                bookingDays={s.booking_days}
                day={day}
                time={choice}
                onDay={(d) => {
                  setDay(d);
                  setChoice(null);
                }}
                onTime={setChoice}
              />
            )}
            {error && <ErrorAlert message={error} />}
            {s.availability.length > 0 && (
              <Button type="button" variant="primary" size="lg" className="mt-4 w-full" disabled={!choice || busy}
                onClick={() => act("/book", { starts_at: choice })}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Book this time
              </Button>
            )}
            {human}
          </CardContent>
        </Card>
      )}

      {s.status === "scheduled" && (
        <Card className="mt-4">
          <CardContent className="flex flex-col">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              <div>
                <div className="font-medium">Booked for {s.scheduled_label}</div>
                <p className="mt-1 text-sm text-gray-600">
                  {s.mode === "live_voice" && s.meeting_link
                    ? "Join with the link we emailed you at that time."
                    : `Come back to this page then — it opens at ${fmtDate(s.opens_at, true)}. We'll remind you the day before and an hour before.`}
                </p>
              </div>
            </div>
            {s.mode !== "live_voice" && (
              <Button type="button" variant="primary" size="lg" className="mt-4 w-full" disabled>
                Start interview · opens {fmtDate(s.opens_at, true)}
              </Button>
            )}
            {error && <ErrorAlert message={error} />}
            {s.can_reschedule && (
              <Button type="button" variant="outline" size="lg" className="mt-4 w-full" disabled={busy} onClick={() => act("/reschedule")}>
                Choose another time
              </Button>
            )}
            {human}
          </CardContent>
        </Card>
      )}

      {["human_requested", "no_show", "expired"].includes(s.status) && (
        <Card className="mt-4">
          <CardContent>
            <p className="text-sm text-gray-700">
              {s.status === "human_requested"
                ? "Thanks — a recruiter will contact you to arrange a conversation with a person."
                : "This interview time has passed. A recruiter will be in touch about next steps."}
            </p>
          </CardContent>
        </Card>
      )}

      {["completed", "scored"].includes(s.status) && (
        <Card className="mt-4">
          <CardContent className="text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
            <h2 className="mt-3 text-lg font-semibold">Interview submitted</h2>
            <p className="mt-2 text-sm text-gray-600">Thank you. A recruiter reviews every interview and will be in touch.</p>
          </CardContent>
        </Card>
      )}
    </CandidateFrame>
  );
}
