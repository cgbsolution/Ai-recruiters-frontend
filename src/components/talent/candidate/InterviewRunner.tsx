"use client";

import React, { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, CircleAlert, Loader2, Mic, MicOff, Square, Timer, UserRound } from "lucide-react";
import { ApiError } from "@/lib/api";
import { publicForm, publicPost, type InterviewProgress, type InterviewState } from "@/lib/talent";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { CandidateFrame } from "./CandidateFrame";

const MAX_RECORDING_SECONDS = 180;

function fmtClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
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
    return (
      <Alert variant="warning">
        <MicOff />
        <AlertDescription>We couldn&apos;t use your microphone. You can type your answer instead.</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {state === "recording" ? (
          <Button type="button" variant="destructive" size="lg" onClick={stop} className="shrink-0 font-semibold tabular-nums">
            <Square className="h-4 w-4" /> Stop ({fmtClock(elapsed)})
          </Button>
        ) : (
          <Button type="button" variant="outline" size="lg" onClick={start} disabled={disabled} className="shrink-0">
            <Mic className="h-4 w-4" /> {state === "done" ? "Record again" : "Record answer"}
          </Button>
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
    <Button type="button" variant="link" onClick={async () => { await publicPost(`${base}/human`, {}); onDone(); }}
      className="h-auto justify-start gap-1.5 self-start px-0 font-normal text-gray-600 has-[>svg]:px-0">
      <UserRound className="h-4 w-4" /> I&apos;d rather talk to a person
    </Button>
  );

  if (state.mode === "live_voice" && (liveUrl || state.status === "in_progress")) {
    return (
      <CandidateFrame org={state.organization} brand={state.brand}>
        <h1 className="text-2xl font-semibold tracking-tight">Your live interview</h1>
        <Card className="mt-5">
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-gray-700">
              The live voice interview opens in a new page. Use a quiet place, allow your microphone and camera when asked,
              and keep this page open in case you need to rejoin.
            </p>
            {error && <ErrorAlert message={error} />}
            {liveUrl ? (
              <Button asChild variant="primary" size="lg" className="w-full font-semibold">
                <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                  Join the live interview
                </a>
              </Button>
            ) : (
              <Button type="button" variant="primary" size="lg" className="w-full" disabled={busy} onClick={joinLive}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Rejoin the live interview
              </Button>
            )}
            {human}
          </CardContent>
        </Card>
      </CandidateFrame>
    );
  }

  if (!progress) {
    return (
      <CandidateFrame org={state.organization} brand={state.brand}>
        <h1 className="text-2xl font-semibold tracking-tight">Before you start</h1>
        <Card className="mt-5">
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-3 text-sm text-gray-700">
              <Bot className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
              <p>{state.disclosure}</p>
            </div>
            <p className="text-sm text-gray-600">
              {state.question_count} questions, {state.time_limit_minutes} minutes in total. If an answer is too short to judge, you may get one follow-up question.
            </p>
            <div className="flex items-start gap-3">
              <Checkbox id="interview-ack" checked={ack} onCheckedChange={(v) => setAck(v === true)} />
              <Label htmlFor="interview-ack" className="font-normal leading-5">
                I understand this interview is conducted by an AI, and a recruiter will review it.
              </Label>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox id="interview-record-consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
              <Label htmlFor="interview-record-consent" className="font-normal leading-5">
                I agree to my answers{state.mode === "async_voice" ? " (including audio recordings)" : ""} being recorded for this application.
              </Label>
            </div>
            {state.mode === "async_voice" && (
              <fieldset className="text-sm">
                <legend className="mb-2 font-medium text-gray-800">How would you like to answer?</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["audio", "text"] as const).map((m) => (
                    <Button key={m} type="button" variant={mode === m ? "primary" : "outline"} size="lg" aria-pressed={mode === m}
                      onClick={() => setMode(m)} className="w-full">
                      {m === "audio" ? "Speak" : "Type"}
                    </Button>
                  ))}
                </div>
              </fieldset>
            )}
            {error && <ErrorAlert message={error} />}
            <Button type="button" variant="primary" size="lg" className="w-full" disabled={!ack || !consent || busy}
              onClick={() => state.mode === "live_voice" ? joinLive() : run(() => publicPost<InterviewProgress>(`${base}/start`, {
                disclosure_acknowledged: ack, consent_to_record: consent, answer_mode: mode,
              }))}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Start the interview
            </Button>
            {human}
          </CardContent>
        </Card>
      </CandidateFrame>
    );
  }

  if (progress.status !== "in_progress" || !progress.question) {
    return (
      <CandidateFrame org={state.organization} brand={state.brand}>
        <Card>
          <CardContent className="text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
            <h2 className="mt-3 text-lg font-semibold">Interview submitted</h2>
            <p className="mt-2 text-sm text-gray-600">Thank you. A recruiter reviews every interview and will be in touch.</p>
          </CardContent>
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
      <Progress className="mt-2 h-1.5" value={Math.min(100, (progress.answered / Math.max(progress.total, 1)) * 100)} aria-hidden />
      <Card className="mt-5 gap-4">
        <CardHeader>
          <CardTitle className="leading-7">
            <h1 id="interview-question" className="text-lg font-semibold leading-7">{q.text}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {mode === "audio" ? (
            <>
              <Recorder onReady={setAudio} disabled={busy} />
              <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)}
                placeholder="Optional: add anything in writing" aria-label="Optional: add anything in writing"
                className="min-h-20 p-3" />
            </>
          ) : (
            <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer"
              aria-labelledby="interview-question" className="min-h-48 p-3" />
          )}
          {error && <ErrorAlert message={error} />}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="primary" size="lg" className="flex-1"
              disabled={busy || (mode === "audio" ? !audio && !text.trim() : !text.trim())} onClick={submit}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {busy ? "Saving…" : "Next"}
            </Button>
            <Button type="button" variant="outline" size="lg" disabled={busy}
              onClick={() => run(async () => {
                await publicPost(`${base}/finish`, {});
                return { ...progress, status: "completed" };
              })}>
              Finish now
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="mt-4">{human}</div>
    </CandidateFrame>
  );
}
