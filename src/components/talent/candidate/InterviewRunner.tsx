"use client";

import React, { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, Loader2, Mic, Square, Timer, UserRound } from "lucide-react";
import { ApiError } from "@/lib/api";
import { publicForm, publicPost, type InterviewProgress, type InterviewState } from "@/lib/talent";
import { cn } from "@/lib/utils";
import { Card, CandidateFrame, PrimaryButton, SecondaryButton } from "./CandidateFrame";

const MAX_RECORDING_SECONDS = 180;

function fmtClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Recorder({ onReady, disabled }: { onReady: (blob: Blob | null) => void; disabled: boolean }) {
  const [state, setState] = useState<"idle" | "recording" | "done" | "denied">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        setUrl(URL.createObjectURL(blob));
        setState("done");
        onReady(blob);
      };
      rec.current = r;
      r.start();
      setElapsed(0);
      setState("recording");
      onReady(null);
      timer.current = setInterval(() => {
        setElapsed((e) => {
          if (e + 1 >= MAX_RECORDING_SECONDS) stop();
          return e + 1;
        });
      }, 1000);
    } catch {
      setState("denied");
    }
  };

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  };

  if (state === "denied") {
    return <p className="text-sm text-amber-700">We couldn&apos;t use your microphone. You can type your answer instead.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {state === "recording" ? (
          <button type="button" onClick={stop}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white">
            <Square className="h-4 w-4" /> Stop ({fmtClock(elapsed)})
          </button>
        ) : (
          <button type="button" onClick={start} disabled={disabled}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 disabled:opacity-60">
            <Mic className="h-4 w-4" /> {state === "done" ? "Record again" : "Record answer"}
          </button>
        )}
        <span className="text-xs text-gray-500">Up to {MAX_RECORDING_SECONDS / 60} minutes per answer.</span>
      </div>
      {url && state === "done" && <audio controls src={url} className="w-full" />}
    </div>
  );
}

export function InterviewRunner({ token, state, onDone }: { token: string; state: InterviewState; onDone: () => void }) {
  const base = `/interview/${encodeURIComponent(token)}`;
  const [progress, setProgress] = useState<InterviewProgress | null>(state.progress);
  const [ack, setAck] = useState(false);
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState<"text" | "audio">(state.mode === "async_voice" ? "audio" : "text");
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(state.progress?.seconds_left ?? null);

  useEffect(() => {
    if (progress?.seconds_left == null) return;
    setLeft(progress.seconds_left);
    const t = setInterval(() => setLeft((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
  }, [progress?.seconds_left]);

  const run = async (fn: () => Promise<InterviewProgress>) => {
    setError(null);
    setBusy(true);
    try {
      const p = await fn();
      setProgress(p);
      setText("");
      setAudio(null);
      if (p.status !== "in_progress") onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Something went wrong. Please try again.");
      if (e instanceof ApiError && e.status === 409 && /time|submitted/i.test(e.detail)) onDone();
    } finally {
      setBusy(false);
    }
  };

  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const joinLive = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await publicPost<{ live_url: string }>(`${base}/start`, { disclosure_acknowledged: true, consent_to_record: true });
      setLiveUrl(r.live_url);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const human = (
    <button type="button" onClick={async () => { await publicPost(`${base}/human`, {}); onDone(); }}
      className="inline-flex items-center gap-1.5 text-sm text-gray-600 underline-offset-2 hover:underline">
      <UserRound className="h-4 w-4" /> I&apos;d rather talk to a person
    </button>
  );

  if (state.mode === "live_voice" && (liveUrl || state.status === "in_progress")) {
    return (
      <CandidateFrame org={state.organization} brand={state.brand}>
        <h1 className="text-2xl font-semibold tracking-tight">Your live interview</h1>
        <Card className="mt-5 space-y-4">
          <p className="text-sm text-gray-700">
            The live voice interview opens in a new page. Use a quiet place, allow your microphone and camera when asked,
            and keep this page open in case you need to rejoin.
          </p>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {liveUrl ? (
            <a href={liveUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600">
              Join the live interview
            </a>
          ) : (
            <PrimaryButton className="w-full" disabled={busy} onClick={joinLive}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Rejoin the live interview
            </PrimaryButton>
          )}
          {human}
        </Card>
      </CandidateFrame>
    );
  }

  if (!progress) {
    return (
      <CandidateFrame org={state.organization} brand={state.brand}>
        <h1 className="text-2xl font-semibold tracking-tight">Before you start</h1>
        <Card className="mt-5 space-y-4">
          <div className="flex gap-3 text-sm text-gray-700">
            <Bot className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
            <p>{state.disclosure}</p>
          </div>
          <p className="text-sm text-gray-600">
            {state.question_count} questions, {state.time_limit_minutes} minutes in total. If an answer is too short to judge, you may get one follow-up question.
          </p>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-500" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            I understand this interview is conducted by an AI, and a recruiter will review it.
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-500" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I agree to my answers{state.mode === "async_voice" ? " (including audio recordings)" : ""} being recorded for this application.
          </label>
          {state.mode === "async_voice" && (
            <fieldset className="text-sm">
              <legend className="mb-1.5 font-medium text-gray-800">How would you like to answer?</legend>
              <div className="flex gap-2">
                {(["audio", "text"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className={cn("rounded-xl border px-3 py-2", mode === m ? "border-brand-500 bg-brand-50" : "border-gray-200")}>
                    {m === "audio" ? "Speak" : "Type"}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <PrimaryButton className="w-full" disabled={!ack || !consent || busy}
            onClick={() => state.mode === "live_voice" ? joinLive() : run(() => publicPost<InterviewProgress>(`${base}/start`, {
              disclosure_acknowledged: ack, consent_to_record: consent, answer_mode: mode,
            }))}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Start the interview
          </PrimaryButton>
          {human}
        </Card>
      </CandidateFrame>
    );
  }

  if (progress.status !== "in_progress" || !progress.question) {
    return (
      <CandidateFrame org={state.organization} brand={state.brand}>
        <Card className="text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">Interview submitted</h2>
          <p className="mt-2 text-sm text-gray-600">Thank you. A recruiter reviews every interview and will be in touch.</p>
        </Card>
      </CandidateFrame>
    );
  }

  const q = progress.question;
  const submit = () =>
    run(() => {
      const form = new FormData();
      form.append("question_id", q.id);
      if (text.trim()) form.append("text", text.trim());
      if (mode === "audio" && audio) form.append("audio", audio, "answer.webm");
      return publicForm<InterviewProgress>(`${base}/answer`, form);
    });

  return (
    <CandidateFrame org={state.organization} brand={state.brand}>
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          Question {Math.min(progress.answered + 1, progress.total)} of {progress.total}
          {q.follow_up && " · follow-up"}
        </span>
        {left != null && (
          <span className={cn("inline-flex items-center gap-1 tabular-nums", left < 300 && "font-semibold text-amber-700")}>
            <Timer className="h-4 w-4" aria-hidden /> {fmtClock(left)} left
          </span>
        )}
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-gray-200" aria-hidden>
        <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(progress.answered / Math.max(progress.total, 1)) * 100}%` }} />
      </div>
      <Card className="mt-5">
        <h1 className="text-lg font-semibold leading-7">{q.text}</h1>
        <div className="mt-4 space-y-3">
          {mode === "audio" ? (
            <>
              <Recorder onReady={setAudio} disabled={busy} />
              <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)}
                placeholder="Optional: add anything in writing"
                className="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
            </>
          ) : (
            <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer"
              className="w-full rounded-xl border border-gray-300 p-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 sm:text-sm" />
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <PrimaryButton className="flex-1" disabled={busy || (mode === "audio" ? !audio && !text.trim() : !text.trim())} onClick={submit}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {busy ? "Saving…" : "Next"}
            </PrimaryButton>
            <SecondaryButton disabled={busy}
              onClick={() => run(async () => {
                await publicPost(`${base}/finish`, {});
                return { ...progress, status: "completed" };
              })}>
              Finish now
            </SecondaryButton>
          </div>
        </div>
      </Card>
      <div className="mt-4">{human}</div>
    </CandidateFrame>
  );
}
