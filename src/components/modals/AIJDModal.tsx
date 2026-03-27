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
      <DialogContent className="sm:max-w-[680px] p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Generate AI Job Description</DialogTitle>
        </DialogHeader>
        {screen === 1 ? (
          /* ── Screen 1: Input ── */
          <div className="p-6 space-y-5">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
              Generate AI Job Description
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Type a job title, paste an existing JD, or describe the role. The AI
              will generate a complete structured job description.
            </p>

            <Textarea
              placeholder="e.g. React Developer with Redux, TypeScript, REST APIs — 3 years exp in a fintech product team"
              value={jdInput}
              onChange={(e) => setJdInput(e.target.value)}
              className="min-h-[180px] bg-slate-50 dark:bg-gray-800 resize-none text-sm"
            />

            <div>
              <label className="block text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">
                Experience Range &nbsp;
                <span className="font-semibold text-indigo-600">
                  {experienceRange[0]} – {experienceRange[1]} years
                </span>
              </label>
              <div className="px-1 pb-1">
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
                <div className="flex justify-between text-xs text-gray-400 mt-2">
                  {[0, 3, 6, 9, 12, 15].map((n) => (
                    <span key={n}>{n}</span>
                  ))}
                </div>
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!jdInput.trim() || isGenerating}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-8"
            >
              {isGenerating ? "Generating…" : "Generate JD"}
            </Button>
          </div>
        ) : (
          /* ── Screen 2: Rich Preview ── */
          <div className="flex flex-col max-h-[90vh]">
            {/* Scrollable preview area */}
            <div className="overflow-y-auto flex-1 px-6 pt-6 pb-2 space-y-6 text-sm text-gray-800 dark:text-gray-200">

              {/* ── Job Opening Details ── */}
              <section>
                <SectionTitle>Job Opening Details</SectionTitle>
                <Row label="Title" value={generatedJD?.title ?? ""} />
                <Row
                  label="Experience Required"
                  value={`${generatedJD?.experience_min ?? 0} – ${generatedJD?.experience_max ?? 2} years  (You can change this later)`}
                />
              </section>

              {/* ── Skill Groups ── */}
              <section>
                <SectionTitle>Skill Groups</SectionTitle>
                {generatedJD?.skill_groups.map((grp, i) => (
                  <div
                    key={i}
                    className="mb-4 pl-3 border-l-2 border-indigo-300 dark:border-indigo-600"
                  >
                    <p className="font-semibold text-gray-700 dark:text-gray-100 mb-1">
                      Skill Group {i + 1}: {grp.name}
                    </p>
                    <p className="text-gray-600 dark:text-gray-300 mb-0.5">
                      <span className="font-medium">Skills:</span>{" "}
                      {grp.skills.join(", ")}
                    </p>
                    <p className="text-gray-600 dark:text-gray-300 mb-0.5">
                      <span className="font-medium">Criteria:</span>{" "}
                      {grp.criteria} — {CRITERIA_LABEL[grp.criteria]}
                    </p>
                    <p className="text-gray-600 dark:text-gray-300">
                      <span className="font-medium">Weight:</span> {grp.weight}
                    </p>
                  </div>
                ))}
              </section>

              {/* ── Responsibilities ── */}
              <section>
                <SectionTitle>Job Requirements and Responsibilities</SectionTitle>
                <ul className="space-y-1.5 list-none">
                  {generatedJD?.responsibilities.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-indigo-400 mt-0.5">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* ── Special Instructions ── */}
              <section>
                <SectionTitle>Special Instructions</SectionTitle>
                {generatedJD?.special_instructions ? (
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    {generatedJD.special_instructions}
                  </p>
                ) : (
                  <p className="text-gray-400 italic">None</p>
                )}
              </section>

              {/* ── Coding Questions ── */}
              <section>
                <SectionTitle>Coding Questions</SectionTitle>
                <p className="text-gray-700 dark:text-gray-300">
                  Number of coding questions:{" "}
                  <span className="font-semibold">
                    {generatedJD?.coding_questions_count ?? 0}
                  </span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  (Coding questions are mandatory and should always be included.)
                </p>
              </section>

              {/* ── Business Context ── */}
              <section>
                <SectionTitle>Business Context</SectionTitle>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {generatedJD?.business_context ||
                    "No specific business context mentioned."}
                </p>
              </section>

              {/* ── Experience footer ── */}
              <section>
                <SectionTitle>Experience Required</SectionTitle>
                <p className="text-gray-700 dark:text-gray-300">
                  {generatedJD?.experience_min ?? 0} –{" "}
                  {generatedJD?.experience_max ?? 2} years
                </p>
              </section>

              {/* ── Confirmation ── */}
              <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-xl p-4 border border-indigo-200 dark:border-indigo-700">
                <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
                  Would you like to confirm these details to create the job opening?
                </p>
              </div>
            </div>

            {/* ── Footer: extra details + action buttons ── */}
            <div className="px-6 pb-6 pt-3 space-y-3 border-t border-gray-100 dark:border-gray-800">
              <Textarea
                placeholder="Add more details or corrections before regenerating…"
                value={additionalDetails}
                onChange={(e) => setAdditionalDetails(e.target.value)}
                className="min-h-[60px] bg-slate-50 dark:bg-gray-800 resize-none text-sm"
              />
              <div className="flex gap-3">
                <Button
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                  className="bg-green-500 hover:bg-green-600 text-white rounded-xl px-6"
                >
                  {isGenerating ? "Regenerating…" : "Regenerate"}
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={isGenerating}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6"
                >
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 mb-2 border-b border-gray-200 dark:border-gray-700 pb-1">
      {children}
    </h3>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2">
      <span className="font-medium text-gray-700 dark:text-gray-300">
        {label}:
      </span>{" "}
      <span className="text-gray-600 dark:text-gray-400">{value}</span>
    </div>
  );
}
