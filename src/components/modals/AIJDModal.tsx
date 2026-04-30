"use client";
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Slider,
  SliderTrack,
  SliderRange,
  SliderThumb,
} from "@/components/ui/slider";
import { notifyError } from "@/lib/notify";
import { apiPost } from "@/lib/api";
import {
  Sparkles,
  Target,
  Wand2,
  RefreshCcw,
  Check,
  FileText,
  Layers,
  ListChecks,
  Code2,
  Building2,
  BriefcaseBusiness,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AISkillGroup {
  name: string;
  skills: string[];
  criteria: 1 | 2 | 3;
  weight: number;
}

export interface AIGeneratedJD {
  title: string;
  summary: string;
  experience_min: number;
  experience_max: number;
  responsibilities: string[];
  skill_groups: AISkillGroup[];
  special_instructions: string;
  coding_questions_count: number;
  business_context: string;
}

interface AIJDModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJDGenerated: (jd: AIGeneratedJD) => void;
}

// ── Criteria helpers ─────────────────────────────────────────────────────────

const CRITERIA_LABEL: Record<number, string> = {
  1: "All skills are required",
  2: "At least one skill is required",
  3: "Good to have, not mandatory",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function AIJDModal({
  isOpen,
  onClose,
  onJDGenerated,
}: AIJDModalProps) {
  const [screen, setScreen] = useState<1 | 2>(1);

  // Screen 1
  const [jdInput, setJdInput] = useState("");
  const [experienceRange, setExperienceRange] = useState<number[]>([0, 2]);

  // Screen 2
  const [generatedJD, setGeneratedJD] = useState<AIGeneratedJD | null>(null);
  const [additionalDetails, setAdditionalDetails] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // ── API call ───────────────────────────────────────────────────────────────

  const callAPI = async (extra?: string) => {
    if (!jdInput.trim()) return;
    setIsGenerating(true);
    try {
      const inputText = extra
        ? `${jdInput}\n\nAdditional Requirements: ${extra}`
        : jdInput;

      const data = await apiPost<AIGeneratedJD>("/ai/generate-jd", {
        title: inputText,
        department: "",
        experience_min: experienceRange[0],
        experience_max: experienceRange[1],
        experience_level: `${experienceRange[0]}-${experienceRange[1]} Years`,
        job_type: "Full-time",
        location: "",
      });
      setGeneratedJD(data);
      setScreen(2);
    } catch (err) {
      notifyError("Failed to generate JD. Please try again.");
      console.error("AI JD generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGenerate = () => callAPI();
  const handleRegenerate = () => callAPI(additionalDetails);

  const handleConfirm = () => {
    if (!generatedJD) return;
    onJDGenerated(generatedJD);
    handleClose();
  };

  const handleClose = () => {
    setScreen(1);
    setJdInput("");
    setAdditionalDetails("");
    setGeneratedJD(null);
    onClose();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[680px] overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>AI Job Description Generator</DialogTitle>
        </DialogHeader>

        {screen === 1 ? (
          /* ── Screen 1: Input ── */
          <>
            {/* Modern gradient header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-6 py-5 dark:from-indigo-500/10 dark:via-gray-900 dark:to-purple-500/10">
              <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />
              <div className="pointer-events-none absolute -bottom-14 -left-10 h-40 w-40 rounded-full bg-purple-200/40 blur-3xl dark:bg-purple-500/10" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900 dark:ring-white/10">
                  <Sparkles className="h-5 w-5 text-indigo-500" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-gray-900 sm:text-lg dark:text-white">
                    AI Job Description Generator
                  </h2>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                    Describe the role — the AI drafts a complete structured JD.
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="space-y-5 px-6 pb-5 pt-5">
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Describe the role
                </label>
                <Textarea
                  placeholder="e.g. React Developer with Redux, TypeScript, REST APIs — 3 years exp in a fintech product team"
                  value={jdInput}
                  onChange={(e) => setJdInput(e.target.value)}
                  className="min-h-[160px] resize-none text-sm"
                />
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <Target className="h-3.5 w-3.5 text-indigo-400" />
                    Experience Range
                  </label>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                    {experienceRange[0]} – {experienceRange[1]} yrs
                  </span>
                </div>
                <div className="px-1 pt-4">
                  <Slider
                    value={experienceRange}
                    onValueChange={(v: number[]) => setExperienceRange(v)}
                    min={0}
                    max={15}
                    step={1}
                  >
                    <SliderTrack>
                      <SliderRange />
                    </SliderTrack>
                    <SliderThumb value={experienceRange[0]} />
                    <SliderThumb value={experienceRange[1]} />
                  </Slider>
                  <div className="mt-2 flex justify-between text-[11px] text-gray-400">
                    {[0, 3, 6, 9, 12, 15].map((n) => (
                      <span key={n}>{n}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer action */}
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/40 px-6 py-3 dark:border-white/10 dark:bg-white/5">
              <Button
                onClick={handleGenerate}
                disabled={!jdInput.trim() || isGenerating}
                className="gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm transition-all hover:from-indigo-600 hover:to-purple-600 hover:shadow disabled:from-indigo-300 disabled:to-purple-300"
              >
                <Wand2 className="h-4 w-4" />
                {isGenerating ? "Generating…" : "Generate JD"}
              </Button>
            </div>
          </>
        ) : (
          /* ── Screen 2: Rich Preview ── */
          <div className="flex max-h-[90vh] flex-col">
            {/* Header strip */}
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-6 py-4 dark:from-indigo-500/10 dark:via-gray-900 dark:to-purple-500/10">
              <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900 dark:ring-white/10">
                  <FileText className="h-4 w-4 text-indigo-500" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    AI-Generated Preview
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Review the draft and confirm — you can still edit everything in the form.
                  </p>
                </div>
              </div>
            </div>

            {/* Scrollable preview area */}
            <div className="flex-1 space-y-5 overflow-y-auto px-6 pb-4 pt-5 text-sm text-gray-800 dark:text-gray-200">
              {/* Job Opening Details */}
              <section>
                <SectionTitle icon={<BriefcaseBusiness className="h-3.5 w-3.5" />}>Job Opening Details</SectionTitle>
                <Row label="Title" value={generatedJD?.title ?? ""} />
                <Row
                  label="Experience Required"
                  value={`${generatedJD?.experience_min ?? 0} – ${generatedJD?.experience_max ?? 2} years  (You can change this later)`}
                />
              </section>

              {/* Skill Groups */}
              <section>
                <SectionTitle icon={<Layers className="h-3.5 w-3.5" />}>Skill Groups</SectionTitle>
                <div className="space-y-3">
                  {generatedJD?.skill_groups.map((grp, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 dark:border-white/10 dark:bg-white/5"
                    >
                      <p className="mb-1 text-sm font-semibold text-gray-800 dark:text-white">
                        <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md bg-indigo-100 text-[10px] font-bold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                          {i + 1}
                        </span>
                        {grp.name}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {grp.skills.map((s, si) => (
                          <span
                            key={si}
                            className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-700 ring-1 ring-gray-200 dark:bg-white/10 dark:text-gray-200 dark:ring-white/10"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Criteria:</span>{" "}
                          {CRITERIA_LABEL[grp.criteria]}
                        </span>
                        <span>
                          <span className="font-medium text-gray-700 dark:text-gray-300">Weight:</span>{" "}
                          {grp.weight}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Responsibilities */}
              <section>
                <SectionTitle icon={<ListChecks className="h-3.5 w-3.5" />}>Responsibilities</SectionTitle>
                <ul className="space-y-1.5">
                  {generatedJD?.responsibilities.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                      <span className="text-gray-700 dark:text-gray-300">{r}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Coding Questions */}
              <section>
                <SectionTitle icon={<Code2 className="h-3.5 w-3.5" />}>Coding Questions</SectionTitle>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                    {generatedJD?.coding_questions_count ?? 0} questions
                  </span>
                  <span className="text-xs text-gray-400">(mandatory)</span>
                </div>
              </section>

              {/* Business Context */}
              <section>
                <SectionTitle icon={<Building2 className="h-3.5 w-3.5" />}>Business Context</SectionTitle>
                <p className="leading-relaxed text-gray-700 dark:text-gray-300">
                  {generatedJD?.business_context || "No specific business context mentioned."}
                </p>
              </section>

              {/* Confirmation */}
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/10">
                <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
                  Would you like to confirm these details to create the job opening?
                </p>
              </div>
            </div>

            {/* Footer: regenerate + confirm */}
            <div className="space-y-3 border-t border-gray-100 bg-gray-50/40 px-6 py-4 dark:border-white/10 dark:bg-white/5">
              <Textarea
                placeholder="Add more details or corrections before regenerating…"
                value={additionalDetails}
                onChange={(e) => setAdditionalDetails(e.target.value)}
                className="min-h-[60px] resize-none text-sm"
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                  variant="outline"
                  className="gap-1.5 rounded-xl"
                >
                  <RefreshCcw className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />
                  {isGenerating ? "Regenerating…" : "Regenerate"}
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={isGenerating}
                  className="gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm hover:from-indigo-600 hover:to-purple-600"
                >
                  <Check className="h-4 w-4" />
                  Confirm &amp; Fill Form
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function SectionTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
      {icon}
      {children}
    </h3>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-1.5 text-sm">
      <span className="font-medium text-gray-700 dark:text-gray-200">{label}:</span>{" "}
      <span className="text-gray-600 dark:text-gray-400">{value}</span>
    </div>
  );
}
