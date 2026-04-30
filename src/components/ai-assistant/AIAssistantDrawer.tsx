"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useAIAssistant,
  type AIMessage,
  type InterviewConfig,
} from "@/context/AIAssistantContext";
import { AIMascot } from "./AIMascot";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  X,
  Send,
  Paperclip,
  Mic,
  RotateCcw,
  Briefcase,
  GraduationCap,
  MapPin,
  ListChecks,
  Users,
  ArrowRight,
  Share2,
  CheckCircle2,
  Code2,
  UserCircle2,
  FileText,
  Video,
  ScanFace,
  Smartphone,
  UserCog,
  Camera,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const QUICK_ACTIONS = [
  "Create a Senior React developer job",
  "Hire a backend engineer, remote",
  "Urgent: DevOps engineer, AWS + Kubernetes",
  "Draft a Junior full-stack opening",
];

export function AIAssistantDrawer() {
  const { open, closePanel, messages, sendMessage, reset, step, thinking } = useAIAssistant();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Autoscroll whenever a new message lands
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  // Focus the input when the drawer opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 220);
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && closePanel();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, closePanel]);

  const handleSend = async (text?: string) => {
    const value = (text ?? input).trim();
    if (!value || sending) return;
    setInput("");
    setSending(true);
    try {
      await sendMessage(value);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const mascotState = step === "success" ? "success" : thinking ? "thinking" : "idle";

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={closePanel}
        className={cn(
          "fixed inset-0 z-[60] bg-gray-900/40 backdrop-blur-sm transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="AI Assistant"
        className={cn(
          "fixed right-0 top-0 z-[70] flex h-full w-full max-w-[560px] flex-col border-l border-gray-200 bg-white shadow-2xl transition-transform duration-300 ease-out dark:border-white/10 dark:bg-gray-950",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="relative overflow-hidden border-b border-gray-100 bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-5 py-4 dark:border-white/10 dark:from-indigo-500/10 dark:via-gray-900 dark:to-purple-500/10">
          <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />
          <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-purple-200/40 blur-3xl dark:bg-purple-500/10" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AIMascot state={mascotState} size={40} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                  Hiring Copilot
                </p>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">AI Assistant</h2>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={reset}
                title="New chat"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={closePanel}
                title="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <MessageRenderer key={m.id} message={m} onSend={handleSend} />
            ))}
          </div>
        </div>

        {/* Persistent interview-config panel — visible only while in "configuring" step */}
        {step === "configuring" && (
          <div className="border-t border-gray-100 bg-gradient-to-b from-indigo-50/30 to-white px-5 py-4 dark:border-white/10 dark:from-indigo-500/5 dark:to-transparent">
            <InterviewConfigCard />
          </div>
        )}

        {/* Quick action chips — shown when conversation is fresh or just greeted */}
        {messages.length <= 1 && step === "idle" && (
          <div className="border-t border-gray-100 px-5 pb-2 pt-3 dark:border-white/10">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Try an example
            </p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleSend(q)}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-700 transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 hover:shadow-sm dark:border-white/10 dark:bg-gray-900/60 dark:text-gray-300 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-gray-100 bg-white px-5 py-3 dark:border-white/10 dark:bg-gray-950">
          <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm transition-colors focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-500/10 dark:border-white/10 dark:bg-gray-900/60 dark:focus-within:border-indigo-500/50">
            <button
              type="button"
              title="Attach (coming soon)"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-200"
              aria-label="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Voice (coming soon)"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-200"
              aria-label="Voice input"
            >
              <Mic className="h-4 w-4" />
            </button>

            <Textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the role you want to create…"
              className="min-h-[36px] max-h-40 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm shadow-none focus-visible:ring-0"
              disabled={sending || step === "generating" || step === "creating"}
            />

            <Button
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || sending || step === "generating" || step === "creating"}
              aria-label="Send"
              className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm transition-all hover:from-indigo-600 hover:to-purple-600 disabled:from-gray-300 disabled:to-gray-300"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="mt-2 text-center text-[10px] text-gray-400">
            Copilot creates jobs automatically — no forms, just describe the role.
          </p>
        </div>
      </aside>
    </>
  );
}

/* ═════════════════════════════ Message renderers ═══════════════════════════ */

function MessageRenderer({ message, onSend }: { message: AIMessage; onSend: (t: string) => void }) {
  if (message.role === "user" && message.type === "text") {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[82%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-indigo-500 to-indigo-600 px-3.5 py-2 text-sm leading-relaxed text-white shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant messages share a left-avatar layout
  const Avatar = (
    <div className="mt-0.5 shrink-0">
      <AIMascot state="idle" size={28} />
    </div>
  );

  if (message.type === "typing") {
    return (
      <div className="flex items-start gap-2">
        {Avatar}
        <div className="rounded-2xl rounded-tl-sm bg-gray-100 px-3.5 py-2.5 dark:bg-white/5">
          <TypingDots />
        </div>
      </div>
    );
  }

  if (message.type === "text") {
    return (
      <div className="flex items-start gap-2">
        {Avatar}
        <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-gray-100 px-3.5 py-2 text-sm leading-relaxed text-gray-800 dark:bg-white/5 dark:text-gray-100">
          <RichText text={message.content} />
        </div>
      </div>
    );
  }

  if (message.type === "preview") {
    return (
      <div className="flex items-start gap-2">
        {Avatar}
        <JobPreviewCard jd={message.jd} draft={message.draft} onConfirm={() => onSend("yes")} />
      </div>
    );
  }

  if (message.type === "success") {
    return (
      <div className="flex items-start gap-2">
        {Avatar}
        <SuccessCard jobId={message.jobId} jobTitle={message.jobTitle} />
      </div>
    );
  }

  return null;
}

/* Simple inline markdown: **bold** */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\*\*[^*]+\*\*$/.test(p) ? (
          <strong key={i} className="font-semibold text-gray-900 dark:text-white">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="AI is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500"
          style={{
            animation: `typingDot 1.2s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
      <style jsx global>{`
        @keyframes typingDot {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.45; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </span>
  );
}

/* ═════════════════════════════ Preview card ════════════════════════════════ */

function JobPreviewCard({
  jd,
  draft,
  onConfirm,
}: {
  jd: import("@/components/modals/AIJDModal").AIGeneratedJD;
  draft: import("@/components/ai-assistant/flow").JobDraft;
  onConfirm: () => void;
}) {
  return (
    <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-gray-900/60">
      {/* Gradient strip */}
      <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />

      <div className="p-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              Draft preview
            </p>
            <h3 className="mt-0.5 text-sm font-bold text-gray-900 dark:text-white">{jd.title}</h3>
          </div>
        </div>

        {/* Meta chips */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <MetaChip icon={GraduationCap}>
            {jd.experience_min}–{jd.experience_max} yrs
          </MetaChip>
          {draft.location && <MetaChip icon={MapPin}>{draft.location}</MetaChip>}
          <MetaChip icon={Briefcase}>Full-time</MetaChip>
        </div>

        {/* Summary */}
        {jd.summary && (
          <p className="mt-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
            {jd.summary.length > 180 ? jd.summary.slice(0, 180) + "…" : jd.summary}
          </p>
        )}

        {/* Responsibilities */}
        {jd.responsibilities?.length > 0 && (
          <Section icon={ListChecks} label={`Responsibilities (${jd.responsibilities.length})`}>
            <ul className="mt-1.5 space-y-1">
              {jd.responsibilities.slice(0, 3).map((r, i) => (
                <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-indigo-400" />
                  <span>{r.length > 90 ? r.slice(0, 90) + "…" : r}</span>
                </li>
              ))}
              {jd.responsibilities.length > 3 && (
                <li className="pl-3 text-[11px] italic text-gray-400">
                  +{jd.responsibilities.length - 3} more
                </li>
              )}
            </ul>
          </Section>
        )}

        {/* Skills */}
        {jd.skill_groups?.length > 0 && (
          <Section icon={Users} label="Skills">
            <div className="mt-1.5 flex flex-wrap gap-1">
              {jd.skill_groups.flatMap((g) => g.skills).slice(0, 10).map((s, i) => (
                <span
                  key={`${s}-${i}`}
                  className="inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20"
                >
                  {s}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Confirm button */}
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            size="sm"
            onClick={onConfirm}
            className="group h-8 gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-green-500 px-3 text-xs font-semibold text-white shadow-sm hover:from-emerald-600 hover:to-green-600"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Create this job
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-white/5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      {children}
    </div>
  );
}

function MetaChip({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-700 ring-1 ring-gray-200 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10">
      <Icon className="h-3 w-3 text-gray-400" />
      {children}
    </span>
  );
}

/* ═════════════════════════════ Success card ════════════════════════════════ */

function SuccessCard({ jobId, jobTitle }: { jobId: number; jobTitle: string }) {
  const router = useRouter();
  const { closePanel } = useAIAssistant();

  const go = (path: string) => {
    closePanel();
    router.push(path);
  };

  return (
    <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-sm dark:border-emerald-500/30 dark:from-emerald-500/10 dark:to-transparent">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
            Job created
          </p>
          <h3 className="mt-0.5 text-sm font-bold text-gray-900 dark:text-white">{jobTitle}</h3>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
            Your opening is live and ready for candidates.
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => go(`/job-openings/${jobId}/candidates`)}
              className="h-8 gap-1.5 rounded-lg text-xs"
            >
              <Users className="h-3.5 w-3.5" />
              View candidates
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => go(`/job-openings`)}
              className="h-8 gap-1.5 rounded-lg text-xs"
            >
              <Briefcase className="h-3.5 w-3.5" />
              All openings
            </Button>
            <Link
              href={`/job-openings`}
              onClick={() => closePanel()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 dark:border-white/10 dark:bg-gray-900/60 dark:text-gray-300 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════ Interview config card ═══════════════════════ */

const QUESTION_PRESETS = [5, 10, 15, 20];

const FEATURE_ROWS: {
  key: keyof InterviewConfig["features"];
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
}[] = [
  {
    key: "codeEditor",
    label: "Code Editor",
    description: "Live coding environment",
    icon: Code2,
    color: "bg-indigo-50 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300",
  },
  {
    key: "virtualAvatar",
    label: "Virtual Avatar",
    description: "AI asks questions on camera",
    icon: UserCircle2,
    color: "bg-violet-50 text-violet-500 dark:bg-violet-500/15 dark:text-violet-300",
  },
  {
    key: "resumeBased",
    label: "Resume-based Q&A",
    description: "Tailor questions to the CV",
    icon: FileText,
    color: "bg-blue-50 text-blue-500 dark:bg-blue-500/15 dark:text-blue-300",
  },
  {
    key: "webcamRequired",
    label: "Webcam Required",
    description: "Camera must stay on",
    icon: Video,
    color: "bg-sky-50 text-sky-500 dark:bg-sky-500/15 dark:text-sky-300",
  },
  {
    key: "faceMatch",
    label: "Face Match",
    description: "Verify against photo ID",
    icon: ScanFace,
    color: "bg-rose-50 text-rose-500 dark:bg-rose-500/15 dark:text-rose-300",
  },
  {
    key: "allowMobile",
    label: "Allow Mobile",
    description: "Candidates can take on phone",
    icon: Smartphone,
    color: "bg-cyan-50 text-cyan-500 dark:bg-cyan-500/15 dark:text-cyan-300",
  },
  {
    key: "manualInterview",
    label: "Manual Interview",
    description: "Recruiter runs it instead",
    icon: UserCog,
    color: "bg-amber-50 text-amber-500 dark:bg-amber-500/15 dark:text-amber-300",
  },
  {
    key: "secondaryCam",
    label: "Secondary Camera",
    description: "Phone as proctoring cam",
    icon: Camera,
    color: "bg-teal-50 text-teal-500 dark:bg-teal-500/15 dark:text-teal-300",
  },
];

function InterviewConfigCard() {
  const { interviewConfig, updateConfig, finalizeCreate, step } = useAIAssistant();
  const isCreating = step === "creating";

  const toggleFeature = (key: keyof InterviewConfig["features"]) => {
    const nextVal = !interviewConfig.features[key];
    const patch: Partial<InterviewConfig> = {
      features: { ...interviewConfig.features, [key]: nextVal },
    };
    // Mutual exclusivity: Virtual Avatar ↔ Manual Interview
    if (key === "virtualAvatar" && nextVal) patch.features!.manualInterview = false;
    if (key === "manualInterview" && nextVal) patch.features!.virtualAvatar = false;
    updateConfig(patch);
  };

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-gray-900/60">
      {/* Gradient strip */}
      <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500" />

      <div className="max-h-[340px] overflow-y-auto p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300">
            <Settings2 className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              Interview setup
            </p>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Configure the interview</h3>
          </div>
        </div>

        {/* Max questions */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Max questions
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {QUESTION_PRESETS.map((n) => {
              const active = interviewConfig.maxQuestions === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => updateConfig({ maxQuestions: n })}
                  className={cn(
                    "inline-flex h-8 min-w-[48px] items-center justify-center rounded-lg px-3 text-xs font-semibold transition-all",
                    active
                      ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm"
                      : "border border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:bg-indigo-50 dark:border-white/10 dark:bg-gray-900/60 dark:text-gray-300 dark:hover:bg-indigo-500/10",
                  )}
                >
                  {n}
                </button>
              );
            })}
            {/* Custom input */}
            <input
              type="number"
              min={1}
              max={50}
              value={interviewConfig.maxQuestions}
              onChange={(e) => {
                const v = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                updateConfig({ maxQuestions: v });
              }}
              className="h-8 w-16 rounded-lg border border-gray-200 bg-white px-2 text-center text-xs font-semibold text-gray-800 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-gray-900/60 dark:text-white"
              aria-label="Custom number of questions"
            />
          </div>
        </div>

        {/* Interview mode */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Interview mode
          </p>
          <div className="mt-1.5 inline-flex rounded-full bg-gray-100 p-0.5 dark:bg-white/5">
            {(["TRADITIONAL", "SCENARIO"] as const).map((m) => {
              const active = interviewConfig.mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => updateConfig({ mode: m })}
                  className={cn(
                    "h-7 rounded-full px-3 text-[11px] font-semibold transition-all",
                    active
                      ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900 dark:text-gray-300",
                  )}
                >
                  {m === "TRADITIONAL" ? "Traditional" : "Scenario Based"}
                </button>
              );
            })}
          </div>
        </div>

        {/* Feature toggles */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Features
          </p>
          <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {FEATURE_ROWS.map((f) => {
              const active = interviewConfig.features[f.key];
              return (
                <label
                  key={f.key}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-xl border p-2 transition-all",
                    active
                      ? "border-indigo-300 bg-indigo-50/60 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-500/10"
                      : "border-gray-200 bg-white hover:border-gray-300 dark:border-white/10 dark:bg-gray-900/60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleFeature(f.key)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", f.color)}>
                    <f.icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-gray-900 dark:text-white">
                      {f.label}
                    </p>
                    <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                      {f.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Create button */}
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            size="sm"
            onClick={() => finalizeCreate(interviewConfig)}
            disabled={isCreating}
            className="group h-8 gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-green-500 px-3 text-xs font-semibold text-white shadow-sm hover:from-emerald-600 hover:to-green-600 disabled:opacity-60"
          >
            {isCreating ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Creating…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Create Job
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
