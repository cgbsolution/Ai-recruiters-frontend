"use client";

import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCheck,
  ChevronRight,
  CornerDownRight,
  Eye,
  FileText,
  MessageSquareQuote,
  Mic,
  Pencil,
  Quote,
  Send,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { mediaUrl } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { talentGet, talentPost, type CriterionScore, type InterviewDetail, type TranscriptTurn } from "@/lib/talent";
import { cn } from "@/lib/utils";
import { DataTable, DataTableColumnHeader, EmptyState, Person, RelativeTime, ScoreBar } from "./data-table";
import { Panel, Pill, TalentShell, stackedAction, useTalentOrg } from "./TalentShell";

const MODE_LABELS: Record<string, string> = {
  async_text: "Async text",
  async_voice: "Async voice",
  live_voice: "Live voice",
};
const modeLabel = (mode: string) => MODE_LABELS[mode] ?? mode.replace(/_/g, " ");

const AMBER_BADGE = "border-transparent bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";

/** A quote counts as evidence only when it was found in the transcript. */
const isVerified = (e: CriterionScore["evidence"][number]) => e.verified && e.answer_index != null;

function ReviewPill({ value }: { value: string | null }) {
  if (value === "pending") return <Pill tone="amber">awaiting review</Pill>;
  if (value === "reviewed") return <Pill tone="green">reviewed</Pill>;
  if (value) return <Pill>{value}</Pill>;
  return <span className="text-muted-foreground">—</span>;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</div>;
}

// ── Transcript ──────────────────────────────────────────────────────────────

type NumberedTurn = TranscriptTurn & { key: number; answer?: number; question?: number; followUp?: boolean };

/** Answers are numbered 0.. in order (the scores' answer_index); questions 1.., follow-ups unnumbered. */
function numberTurns(transcript: TranscriptTurn[]): NumberedTurn[] {
  let answer = -1;
  let question = 0;
  return transcript.map((t, key) => {
    if (t.turn === "answer") {
      answer += 1;
      return { ...t, key, answer };
    }
    const followUp = t.question_id.endsWith("-f");
    if (!followUp) question += 1;
    return { ...t, key, question, followUp };
  });
}

function Transcript({ turns, focus }: { turns: NumberedTurn[]; focus: number | null }) {
  if (!turns.length) {
    return <EmptyState icon={FileText} title="No transcript" description="Nothing was recorded for this interview." />;
  }
  return (
    <ol className="space-y-4">
      {turns.map((t) =>
        t.answer == null ? (
          <li key={t.key} className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground tabular-nums"
            >
              {t.followUp ? <CornerDownRight className="size-3.5" /> : `Q${t.question}`}
            </span>
            <div className="min-w-0 pt-1 text-sm font-medium break-words text-foreground">
              {t.followUp && (
                <Badge variant="outline" className="mr-2 align-middle font-normal">
                  Follow-up
                </Badge>
              )}
              {t.text}
            </div>
          </li>
        ) : (
          <li key={t.key} id={`answer-${t.answer}`} className="scroll-mt-24 pl-10">
            <Card
              className={cn(
                "gap-0 bg-muted/40 py-3 shadow-none transition-shadow",
                focus === t.answer && "border-transparent ring-2 ring-brand-500",
              )}
            >
              <CardContent className="px-3">
                <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium tabular-nums">Answer {t.answer + 1}</span>
                  {t.kind === "audio" && (
                    <Badge variant="secondary" className="font-normal">
                      <Mic /> spoken
                    </Badge>
                  )}
                </div>
                {t.audio_url && <audio controls preload="none" src={mediaUrl(t.audio_url)} className="mb-2 h-9 w-full" />}
                {t.text ? (
                  <p className="text-sm break-words whitespace-pre-wrap text-foreground/90">{t.text}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {t.transcription === "failed" ? "Transcription failed — listen to the recording." : "No text."}
                  </p>
                )}
              </CardContent>
            </Card>
          </li>
        ),
      )}
    </ol>
  );
}

// ── Scores ──────────────────────────────────────────────────────────────────

function OverrideForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: number;
  onSave: (score: number, reason: string) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [score, setScore] = useState(initial);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Card className="gap-0 bg-background py-4 shadow-none">
      <CardContent className="space-y-4 px-4">
        <div>
          <div id={`${id}-score`} className="mb-2 text-sm font-medium text-foreground">
            New score
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`${id}-score`}>
            {[1, 2, 3, 4, 5].map((v) => (
              <Button
                key={v}
                size="icon"
                className="size-9 tabular-nums"
                variant={score === v ? "primary" : "outline"}
                aria-pressed={score === v}
                aria-label={`${v} of 5`}
                onClick={() => setScore(v)}
              >
                {v}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-reason`}>Why</Label>
          <Textarea
            id={`${id}-reason`}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Kept in the audit log"
          />
          <p className="text-xs text-muted-foreground">At least 5 characters. Recorded in the audit log with your name.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={reason.trim().length < 5 || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(score, reason);
              } finally {
                setSaving(false);
              }
            }}
          >
            Save score
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** A criterion's expanded row: rationale, the quotes behind it, notes, and the override editor. */
function CriterionDetail({
  s,
  editable,
  editing,
  onEdit,
  onCancel,
  onQuote,
  onSave,
}: {
  s: CriterionScore;
  editable: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onQuote: (answerIndex: number) => void;
  onSave: (score: number, reason: string) => Promise<void>;
}) {
  return (
    <div className="space-y-4 text-sm">
      {s.rationale && <p className="text-foreground/90">{s.rationale}</p>}
      <div>
        <SectionLabel>Evidence</SectionLabel>
        {s.evidence.length === 0 ? (
          <p className="text-muted-foreground">No quotes given.</p>
        ) : (
          <ul className="space-y-2">
            {s.evidence.map((e, i) => (
              <li key={i} className="flex items-start gap-2">
                <Quote aria-hidden className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                {isVerified(e) ? (
                  <Button
                    variant="link"
                    className="h-auto min-w-0 justify-start p-0 text-left font-normal whitespace-normal text-foreground hover:text-brand-600 dark:hover:text-brand-400"
                    onClick={() => onQuote(e.answer_index as number)}
                  >
                    <span>
                      <q className="italic">{e.quote}</q>{" "}
                      <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                        → answer {(e.answer_index as number) + 1}
                      </span>
                    </span>
                  </Button>
                ) : (
                  <span className="min-w-0 text-muted-foreground">
                    <q className="italic line-through decoration-amber-500/60">{e.quote}</q>{" "}
                    <Badge variant="secondary" className={cn("align-middle font-normal", AMBER_BADGE)}>
                      not found in the transcript
                    </Badge>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {s.notes.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>{s.notes.join(" · ")}</span>
        </div>
      )}
      {s.override && (
        <p className="text-xs text-muted-foreground">
          The AI said {s.score}/5; a recruiter changed it to {s.override.score}/5{" "}
          <RelativeTime iso={s.override.at} />. Reason: {s.override.reason}
        </p>
      )}
      {editing ? (
        <OverrideForm initial={s.override?.score ?? s.score} onSave={onSave} onCancel={onCancel} />
      ) : (
        editable && (
          <Button variant="outline" className="h-8 px-2.5" onClick={onEdit}>
            <Pencil /> Change score
          </Button>
        )
      )}
    </div>
  );
}

function ScoresTable({
  scores,
  rubric,
  editable,
  onQuote,
  onOverride,
}: {
  scores: CriterionScore[];
  rubric: InterviewDetail["rubric"];
  editable: boolean;
  onQuote: (answerIndex: number) => void;
  onOverride: (criterion: string, score: number, reason: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const describe = useMemo(() => new Map((rubric ?? []).map((r) => [r.criterion, r.description])), [rubric]);

  const columns = useMemo<ColumnDef<CriterionScore, unknown>[]>(() => {
    const cols: ColumnDef<CriterionScore, unknown>[] = [
      {
        id: "expand",
        size: 32,
        enableHiding: false,
        enableSorting: false,
        header: () => <span className="sr-only">Details</span>,
        cell: ({ row }) => (
          <ChevronRight
            aria-hidden
            className={cn("size-4 text-muted-foreground transition-transform", row.getIsExpanded() && "rotate-90")}
          />
        ),
      },
      {
        accessorKey: "criterion",
        meta: { label: "Criterion" },
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Criterion" />,
        cell: ({ row }) => {
          const description = describe.get(row.original.criterion);
          return (
            <div className="max-w-72 min-w-40 whitespace-normal">
              <div className="font-medium text-foreground">{row.original.criterion}</div>
              {description && <div className="line-clamp-2 text-xs text-muted-foreground">{description}</div>}
            </div>
          );
        },
      },
      {
        id: "score",
        accessorFn: (s) => s.override?.score ?? s.score,
        meta: { label: "Score" },
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Score" />,
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex items-center gap-2">
              <ScoreBar value={s.override?.score ?? s.score} max={5} />
              {s.override && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="font-normal">
                      changed
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>The AI said {s.score}/5; changed by a recruiter</TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "confidence",
        meta: { label: "Confidence" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Confidence" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground tabular-nums">{Math.round(row.original.confidence * 100)}%</span>
        ),
      },
      {
        id: "evidence",
        accessorFn: (s) => s.evidence.length,
        meta: { label: "Evidence" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Evidence" />,
        cell: ({ row }) => {
          const ev = row.original.evidence;
          const missing = ev.filter((e) => !isVerified(e)).length;
          return (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-muted-foreground tabular-nums">
                <MessageSquareQuote aria-hidden className="size-3.5" />
                {ev.length} {ev.length === 1 ? "quote" : "quotes"}
              </span>
              {missing > 0 && (
                <Badge variant="secondary" className={cn("font-normal tabular-nums", AMBER_BADGE)}>
                  {missing} not found
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "weight",
        meta: { label: "Weight" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Weight" />,
        cell: ({ row }) => {
          const w = row.original.weight;
          return <span className="text-muted-foreground tabular-nums">{Number.isInteger(w) ? w : w.toFixed(2)}</span>;
        },
      },
    ];
    if (editable) {
      cols.push({
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              className="h-8 px-2.5"
              aria-label={`Change the ${row.original.criterion} score`}
              onClick={() => {
                row.toggleExpanded(true);
                setEditing(row.original.criterion);
              }}
            >
              <Pencil /> Change
            </Button>
          </div>
        ),
      });
    }
    return cols;
  }, [describe, editable]);

  return (
    <DataTable
      storageKey="interview-scores"
      columns={columns}
      data={scores}
      getRowId={(s) => s.criterion}
      initialHidden={["weight"]}
      noPagination
      renderExpanded={(s) => (
        <CriterionDetail
          s={s}
          editable={editable}
          editing={editable && editing === s.criterion}
          onEdit={() => setEditing(s.criterion)}
          onCancel={() => setEditing(null)}
          onQuote={onQuote}
          onSave={async (score, reason) => {
            if (await onOverride(s.criterion, score, reason)) setEditing(null);
          }}
        />
      )}
    />
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

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

  const turns = useMemo(() => numberTurns(d?.transcript ?? []), [d?.transcript]);

  if (!d) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading">
        <Skeleton className="h-52 w-full rounded-xl" />
        <div className="grid gap-6 xl:grid-cols-2">
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  /**
   * Show a quoted answer in the transcript (also when it's already the focused one).
   * On wide screens the transcript scrolls on its own beside the scores, so only
   * that box moves; otherwise the page scrolls to the answer.
   */
  const jump = (answerIndex: number) => {
    setFocus(answerIndex);
    const el = document.getElementById(`answer-${answerIndex}`);
    if (!el) return;
    const viewport = el.closest<HTMLElement>("[data-radix-scroll-area-viewport]");
    if (viewport && viewport.scrollHeight > viewport.clientHeight + 1) {
      const top = el.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
      viewport.scrollTo({ top: top - (viewport.clientHeight - el.offsetHeight) / 2, behavior: "smooth" });
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const override = async (criterion: string, score: number, reason: string) => {
    try {
      await talentPost(`/interviews/${d.id}/override`, { criterion, score, reason });
      notifySuccess("Score changed — recorded in the audit log");
      load();
      return true;
    } catch (e) {
      notifyError((e as Error).message);
      return false;
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

  const open = !["submitted", "closed", "declined"].includes(d.match_status);
  const name = d.candidate ?? `Profile #${d.profile_id}`;
  const answers = turns.filter((t) => t.answer != null).length;
  const flags = d.match?.risk_flags ?? [];
  const observations = d.integrity_observations ?? [];

  return (
    <div className="space-y-6">
      <Card className="gap-5">
        <CardHeader>
          <CardTitle className="col-start-1 min-w-0 text-lg leading-tight">
            <Person
              name={name}
              seed={d.profile_id}
              sub={
                <>
                  <Link href={`/talent/jobs/${d.job_ref}`} className="underline-offset-4 hover:text-foreground hover:underline">
                    {d.job_title}
                  </Link>
                  {" · "}
                  {modeLabel(d.mode)} interview
                </>
              }
            />
          </CardTitle>
          <CardAction className={stackedAction}>
            <div className="@xl/card-header:text-right">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Interview score</div>
              <div className="mt-0.5 flex items-baseline gap-1 @xl/card-header:justify-end">
                <span className="text-3xl font-semibold text-foreground tabular-nums">
                  {d.overall_score != null ? d.overall_score.toFixed(1) : "—"}
                </span>
                <span className="text-sm text-muted-foreground">/ 5</span>
              </div>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
            <Fact label="Interview">
              <div className="flex flex-wrap gap-1">
                <Pill>{d.status}</Pill>
                {d.needs_recruiter && <Pill tone="amber">needs you</Pill>}
              </div>
            </Fact>
            <Fact label="Process">
              <Pill>{d.match_status}</Pill>
            </Fact>
            <Fact label="Review">
              <div className="flex flex-col items-start gap-1">
                <ReviewPill value={d.human_review_status} />
                {d.reviewed_at && <RelativeTime iso={d.reviewed_at} className="text-xs text-muted-foreground" />}
              </div>
            </Fact>
            <Fact label="Completed">
              <RelativeTime iso={d.completed_at} />
            </Fact>
            <Fact label="Consent recorded">
              <RelativeTime iso={d.consent_recorded_at} />
            </Fact>
            <Fact label="Match score">
              <ScoreBar value={d.ai_score} max={100} />
            </Fact>
          </dl>
        </CardContent>
        <CardFooter className="flex-wrap gap-2 border-t">
          {d.human_review_status !== "reviewed" && (
            <Button variant="primary" onClick={() => act(`/interviews/${d.id}/review`, {}, "Marked reviewed")}>
              <CheckCheck /> Mark reviewed
            </Button>
          )}
          {open && (
            <>
              <Button variant="outline" onClick={() => setDialog("submit")}>
                <Send /> Submit to client
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setDialog("reject")}
              >
                <XCircle /> Not moving forward
              </Button>
            </>
          )}
          <Button variant="ghost" asChild className="sm:ml-auto">
            <Link href={`/talent/audit?profile_id=${d.profile_id}`}>
              <Eye /> Audit trail
            </Link>
          </Button>
        </CardFooter>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-6">
          {d.summary && (
            <Panel title="Summary">
              <p className="text-sm leading-relaxed text-foreground/90">{d.summary}</p>
            </Panel>
          )}

          <Panel
            title="Scores"
            description="1–5 per criterion. Click a row for its quotes, and a quote to see it in the transcript. Accent, grammar and fluency are not scored unless communication is a criterion."
          >
            {d.scores && d.scores.length > 0 ? (
              <ScoresTable
                scores={d.scores}
                rubric={d.rubric}
                editable={open}
                onQuote={jump}
                onOverride={override}
              />
            ) : (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertTitle>Not scored automatically</AlertTitle>
                <AlertDescription>Review the transcript and decide.</AlertDescription>
              </Alert>
            )}
            <div className="mt-3 text-xs text-muted-foreground">
              Model {d.model ?? "—"} · prompt {d.prompt_version ?? "—"}
            </div>
          </Panel>

          {(flags.length > 0 || observations.length > 0) && (
            <Panel
              title="Things to check"
              description="Neutral notes for a person to look at — not findings, and never a reason on their own."
            >
              <div className="space-y-5">
                {flags.length > 0 && (
                  <div>
                    <SectionLabel>From the CV match</SectionLabel>
                    <ul className="space-y-2.5">
                      {flags.map((f, i) => (
                        <li key={i} className="flex flex-col items-start gap-1">
                          <Badge variant="secondary" className={cn("max-w-full whitespace-normal", AMBER_BADGE)}>
                            <ShieldAlert /> {f.flag}
                          </Badge>
                          {f.evidence && <span className="text-sm text-muted-foreground">{f.evidence}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {observations.length > 0 && (
                  <div>
                    <SectionLabel>From the interview</SectionLabel>
                    <ul className="space-y-2">
                      {observations.map((o, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                          <Eye aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <span>{o}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>

        <Panel
          title="Transcript"
          description="Exactly what the candidate saw and said."
          action={
            <Badge variant="secondary" className="font-normal tabular-nums">
              {answers} {answers === 1 ? "answer" : "answers"}
            </Badge>
          }
          className="min-w-0 xl:sticky xl:top-24"
        >
          <ScrollArea className={cn(turns.length > 6 && "xl:h-[calc(100vh-16rem)]")}>
            <div className="xl:pr-3">
              <Transcript turns={turns} focus={focus} />
            </div>
          </ScrollArea>
        </Panel>
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
              <Label htmlFor="reject-notify" className="leading-snug font-normal">
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
              onClick={() => {
                setDialog(null);
                act(`/matches/${d.match_id}/reject`, { notify, note }, notify ? "Closed and notified" : "Closed");
              }}
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
        onConfirm={() => {
          setDialog(null);
          act(`/matches/${d.match_id}/submit`, {}, "Submitted — decision recorded");
        }}
      />
    </div>
  );
}

export default function InterviewReview({ interviewId }: { interviewId: string }) {
  return (
    <TalentShell
      title="Interview review"
      subtitle="Every score traces back to the candidate's own words. You decide the outcome."
      actions={
        <Button variant="outline" asChild>
          <Link href="/talent/interviews">
            <ArrowLeft /> All interviews
          </Link>
        </Button>
      }
    >
      <ReviewBody interviewId={interviewId} />
    </TalentShell>
  );
}
