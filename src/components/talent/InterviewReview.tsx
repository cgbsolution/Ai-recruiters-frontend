"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCheck, Eye, Send, XCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { mediaUrl } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { fmtDate, talentGet, talentPost, type CriterionScore, type InterviewDetail } from "@/lib/talent";
import { cn } from "@/lib/utils";
import { StatusLine } from "./Charts";
import { Panel, Pill, TalentShell, useTalentOrg } from "./TalentShell";

function ScoreDots({ value, aiValue }: { value: number; aiValue?: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn("h-2.5 w-2.5 rounded-full", i <= value ? "bg-brand-500 dark:bg-brand-400" : "bg-brand-50 dark:bg-brand-500/15",
          aiValue != null && i === aiValue && i !== value && "ring-2 ring-gray-400")} />
      ))}
    </span>
  );
}

function Criterion({ s, onQuote, onOverride, editable }: {
  s: CriterionScore;
  onQuote: (answerIndex: number) => void;
  onOverride: (criterion: string, score: number, reason: string) => Promise<void>;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(s.override?.score ?? s.score);
  const [reason, setReason] = useState("");
  const effective = s.override?.score ?? s.score;
  return (
    <Card className="gap-0 py-3 shadow-none">
      <CardContent className="px-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-white">{s.criterion}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <ScoreDots value={effective} aiValue={s.override ? s.score : undefined} />
              <span className="tabular-nums">{effective}/5</span>
              {s.override ? <span>· AI said {s.score}, changed by recruiter</span> : <span>· confidence {Math.round(s.confidence * 100)}%</span>}
            </div>
          </div>
          {editable && !editing && (
            <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setEditing(true)}>
              Change score
            </Button>
          )}
        </div>
        {s.rationale && <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{s.rationale}</p>}
        <ul className="mt-2 space-y-1">
          {s.evidence.map((e, i) => (
            <li key={i} className="text-sm">
              {e.verified && e.answer_index != null ? (
                <Button
                  variant="link"
                  className="h-auto justify-start whitespace-normal p-0 text-left font-normal text-gray-700 hover:text-brand-600 dark:text-gray-300 dark:hover:text-brand-400"
                  onClick={() => onQuote(e.answer_index as number)}
                >
                  <span>
                    <q className="italic">{e.quote}</q> <span className="text-xs text-gray-400">→ answer {e.answer_index + 1}</span>
                  </span>
                </Button>
              ) : (
                <span className="text-muted-foreground">
                  <q className="italic line-through decoration-amber-500/60">{e.quote}</q>{" "}
                  <span className="text-xs text-amber-700 dark:text-amber-300">not found in the transcript</span>
                </span>
              )}
            </li>
          ))}
          {s.evidence.length === 0 && <li className="text-xs text-muted-foreground">No quotes given.</li>}
        </ul>
        {s.notes.length > 0 && <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">{s.notes.join(" · ")}</div>}
        {s.override && <div className="mt-2 text-xs text-muted-foreground">Recruiter&apos;s reason: {s.override.reason}</div>}
        {editing && (
          <Card className="mt-3 gap-0 bg-muted/50 py-3 shadow-none">
            <CardContent className="space-y-2 px-3">
              <div className="flex gap-1" role="group" aria-label="New score">
                {[1, 2, 3, 4, 5].map((v) => (
                  <Button
                    key={v}
                    size="icon"
                    variant={score === v ? "primary" : "outline"}
                    aria-pressed={score === v}
                    onClick={() => setScore(v)}
                  >
                    {v}
                  </Button>
                ))}
              </div>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why (kept in the audit log)"
                aria-label="Why (kept in the audit log)"
              />
              <div className="flex gap-2">
                <Button variant="primary" disabled={reason.trim().length < 5}
                  onClick={async () => { await onOverride(s.criterion, score, reason); setEditing(false); }}>
                  Save
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewBody({ interviewId }: { interviewId: string }) {
  const { orgId } = useTalentOrg();
  const [d, setD] = useState<InterviewDetail | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [dialog, setDialog] = useState<"submit" | "reject" | null>(null);
  const [notify, setNotify] = useState(true);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    talentGet<InterviewDetail>(`/interviews/${interviewId}`).then(setD).catch((e) => notifyError(e.message));
  }, [interviewId]);

  useEffect(load, [load, orgId]);

  useEffect(() => {
    if (focus == null) return;
    document.getElementById(`answer-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus]);

  if (!d) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading">
        <Skeleton className="h-36 w-full" />
        <div className="grid gap-6 xl:grid-cols-2">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  const override = async (criterion: string, score: number, reason: string) => {
    try {
      await talentPost(`/interviews/${d.id}/override`, { criterion, score, reason });
      notifySuccess("Score changed — recorded in the audit log");
      load();
    } catch (e) {
      notifyError((e as Error).message);
    }
  };

  const act = async (path: string, body: unknown, ok: string) => {
    try {
      await talentPost(path, body);
      notifySuccess(ok);
      load();
    } catch (e) {
      notifyError((e as Error).message);
    }
  };

  let answerIndex = -1;
  const open = !["submitted", "closed", "declined"].includes(d.match_status);

  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{d.candidate}</h2>
              <Pill>{d.status}</Pill>
              <Pill>{d.match_status}</Pill>
              {d.human_review_status === "pending" && <Pill tone="amber">needs review</Pill>}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              <Link href={`/talent/jobs/${d.job_ref}`} className="hover:text-brand-600">{d.job_title}</Link> · {d.mode.replace("_", " ")} ·
              completed {fmtDate(d.completed_at, true)} · consent recorded {fmtDate(d.consent_recorded_at, true)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-semibold text-gray-900 dark:text-white">{d.overall_score != null ? d.overall_score.toFixed(1) : "—"}<span className="text-base text-muted-foreground"> / 5</span></div>
            <div className="text-xs text-muted-foreground">match score {d.ai_score ?? "—"} / 100</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {d.human_review_status !== "reviewed" && (
            <Button variant="primary" onClick={() => act(`/interviews/${d.id}/review`, {}, "Marked reviewed")}>
              <CheckCheck /> Mark reviewed
            </Button>
          )}
          {open && (
            <>
              <Button variant="outline" onClick={() => setDialog("submit")}><Send /> Submit to client</Button>
              <Button variant="outline" onClick={() => setDialog("reject")}><XCircle /> Not moving forward</Button>
            </>
          )}
          <Button variant="ghost" asChild>
            <Link href={`/talent/audit?profile_id=${d.profile_id}`}>
              <Eye /> Audit trail
            </Link>
          </Button>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Transcript" description="Exactly what the candidate saw and said.">
          <ol className="space-y-3">
            {(d.transcript ?? []).map((t, i) => {
              if (t.turn === "answer") answerIndex += 1;
              const idx = answerIndex;
              return t.turn === "question" ? (
                <li key={i} className="text-sm font-medium text-gray-900 dark:text-white">
                  {t.question_id.endsWith("-f") ? "Follow-up: " : ""}{t.text}
                </li>
              ) : (
                <li key={i} id={`answer-${idx}`}>
                  <Card
                    className={cn("gap-0 border-transparent bg-muted/50 py-3 shadow-none transition-colors",
                      focus === idx && "ring-2 ring-brand-500")}
                  >
                    <CardContent className="px-3 text-sm text-gray-700 dark:text-gray-300">
                      <div className="mb-1 text-xs text-gray-400">Answer {idx + 1}{t.kind === "audio" ? " · spoken" : ""}</div>
                      {t.audio_url && <audio controls preload="none" src={mediaUrl(t.audio_url)} className="mb-2 w-full" />}
                      {t.text || <span className="italic text-gray-400">{t.transcription === "failed" ? "Transcription failed — listen to the recording." : "No text."}</span>}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ol>
        </Panel>

        <div className="space-y-6">
          <Panel title="Scores" description="1-5 per criterion. Click a quote to see it in the transcript. Accent, grammar and fluency are not scored unless communication is a criterion.">
            {d.scores ? (
              <div className="space-y-3">
                {d.scores.map((s) => (
                  <Criterion key={s.criterion} s={s} onQuote={setFocus} onOverride={override} editable={open} />
                ))}
              </div>
            ) : (
              <StatusLine level="warning">Not scored automatically — review the transcript and decide.</StatusLine>
            )}
            <div className="mt-3 text-xs text-muted-foreground">Model {d.model ?? "—"} · prompt {d.prompt_version ?? "—"}</div>
          </Panel>
          {d.summary && <Panel title="Summary"><p className="text-sm text-gray-700 dark:text-gray-300">{d.summary}</p></Panel>}
          {d.integrity_observations && d.integrity_observations.length > 0 && (
            <Panel title="Observations to check" description="Neutral notes for a person to look at — not findings, and never a reason on their own.">
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
                {d.integrity_observations.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <AlertDialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Not moving forward</AlertDialogTitle>
            <AlertDialogDescription>
              Closes this candidate&apos;s process for the role. Only you can do this — the agent never does.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Checkbox id="reject-notify" checked={notify} onCheckedChange={(v) => setNotify(v === true)} />
              <Label htmlFor="reject-notify" className="font-normal leading-snug">
                Send the candidate a polite update (consent and opt-outs still apply)
              </Label>
            </div>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal note (optional)"
              aria-label="Internal note (optional)"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => { setDialog(null); act(`/matches/${d.match_id}/reject`, { notify, note }, notify ? "Closed and notified" : "Closed"); }}
            >
              {notify ? "Close and notify" : "Close without notifying"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDialog
        open={dialog === "submit"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Submit ${d.candidate ?? "this candidate"} to the client?`}
        description="This records your decision. Nothing is sent automatically — share the candidate packet with the client yourself."
        confirmLabel="Submit"
        variant="info"
        onConfirm={() => { setDialog(null); act(`/matches/${d.match_id}/submit`, {}, "Submitted — decision recorded"); }}
      />
    </div>
  );
}

export default function InterviewReview({ interviewId }: { interviewId: string }) {
  return (
    <TalentShell title="Interview review" subtitle="Every score traces back to the candidate's own words. You decide the outcome.">
      <ReviewBody interviewId={interviewId} />
    </TalentShell>
  );
}
