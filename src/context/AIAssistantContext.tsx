"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { apiPost, api, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import type { AIGeneratedJD, AISkillGroup } from "@/components/modals/AIJDModal";
import {
  type JobDraft,
  experienceToYears,
  extractSlots,
  friendlyTitle,
  isTechnicalRole,
  missingSlots,
  parseIntent,
  buildJDPrompt,
  SLOT_PROMPTS,
} from "@/components/ai-assistant/flow";

// ── Message types ──────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant";

export type AIMessage =
  | { id: string; role: MessageRole; type: "text"; content: string; ts: number }
  | { id: string; role: "assistant"; type: "preview"; jd: AIGeneratedJD; draft: JobDraft; ts: number }
  | { id: string; role: "assistant"; type: "success"; jobRef: string; jobTitle: string; ts: number }
  | { id: string; role: "assistant"; type: "typing"; ts: number };

// ── Flow steps ─────────────────────────────────────────────────────────────

export type AIStep =
  | "idle"
  | "collecting"
  | "generating"
  | "preview"
  | "configuring"
  | "creating"
  | "success"
  | "error";

// ── Interview config (picked in the config card) ────────────────────────────

export interface InterviewConfig {
  maxQuestions: number;
  mode: "TRADITIONAL" | "SCENARIO";
  features: {
    codeEditor: boolean;
    virtualAvatar: boolean;
    resumeBased: boolean;
    webcamRequired: boolean;
    faceMatch: boolean;
    allowMobile: boolean;
    manualInterview: boolean;
    secondaryCam: boolean;
  };
}

function defaultConfig(draft: JobDraft): InterviewConfig {
  const technical = isTechnicalRole(draft);
  return {
    maxQuestions: 10,
    mode: "TRADITIONAL",
    features: {
      codeEditor: technical,
      virtualAvatar: true,
      resumeBased: true,
      webcamRequired: true,
      faceMatch: false,
      allowMobile: false,
      manualInterview: false,
      secondaryCam: false,
    },
  };
}

interface AIAssistantState {
  open: boolean;
  messages: AIMessage[];
  step: AIStep;
  draft: JobDraft;
  generatedJD: AIGeneratedJD | null;
  interviewConfig: InterviewConfig;
  thinking: boolean;
}

interface AIAssistantContextType extends AIAssistantState {
  openPanel: () => Promise<void>;
  closePanel: () => void;
  togglePanel: () => void;
  sendMessage: (text: string) => Promise<void>;
  /** User said "yes" on preview — transitions to the config card. */
  confirmCreate: () => void;
  /** User finished the config card — actually POSTs the job. */
  finalizeCreate: (config: InterviewConfig) => Promise<void>;
  updateConfig: (patch: Partial<InterviewConfig>) => void;
  reset: () => void;
}

const AIAssistantContext = createContext<AIAssistantContextType | undefined>(undefined);

// ── Helpers ────────────────────────────────────────────────────────────────

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function addAssistantText(
  setMessages: React.Dispatch<React.SetStateAction<AIMessage[]>>,
  content: string,
) {
  setMessages((m) => [
    ...m,
    { id: uid(), role: "assistant", type: "text", content, ts: Date.now() },
  ]);
}

// ── Provider ───────────────────────────────────────────────────────────────

export function AIAssistantProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [step, setStep] = useState<AIStep>("idle");
  const [draft, setDraft] = useState<JobDraft>({});
  const [generatedJD, setGeneratedJD] = useState<AIGeneratedJD | null>(null);
  const [interviewConfig, setInterviewConfig] = useState<InterviewConfig>(defaultConfig({}));
  const [thinking, setThinking] = useState(false);

  // Track the most recent "typing" message id so we can remove it cleanly
  const typingIdRef = useRef<string | null>(null);

  const showTyping = useCallback(() => {
    const id = uid();
    typingIdRef.current = id;
    setMessages((m) => [...m, { id, role: "assistant", type: "typing", ts: Date.now() }]);
    setThinking(true);
  }, []);

  const clearTyping = useCallback(() => {
    setThinking(false);
    const id = typingIdRef.current;
    if (!id) return;
    setMessages((m) => m.filter((msg) => msg.id !== id));
    typingIdRef.current = null;
  }, []);

  const openPanel = useCallback(async () => {
    // Pre-flight: respect the org's job-creation quota — mirrors the behaviour
    // of the manual "Create Opening" modal so the UX is consistent.
    try {
      const res = await api<{ allowed: boolean; message?: string }>("/jobs/can-create");
      if (!res.allowed) {
        notifyError(res.message || "You have exceeded the job limit. Please upgrade your plan.");
        return;
      }
    } catch {
      // Network error → allow anyway; the final POST will re-check server-side.
    }

    setOpen(true);
    // Seed greeting only if there's no conversation yet
    setMessages((m) =>
      m.length > 0
        ? m
        : [
            {
              id: uid(),
              role: "assistant",
              type: "text",
              content:
                "Hi! I'm your hiring copilot. Tell me what you want to create — e.g. \"Create a Senior React developer job\" — and I'll handle the rest.",
              ts: Date.now(),
            },
          ],
    );
  }, []);

  const closePanel = useCallback(() => setOpen(false), []);
  const togglePanel = useCallback(() => setOpen((v) => !v), []);

  const reset = useCallback(() => {
    setMessages([]);
    setStep("idle");
    setDraft({});
    setGeneratedJD(null);
    setInterviewConfig(defaultConfig({}));
    setThinking(false);
    typingIdRef.current = null;
  }, []);

  const updateConfig = useCallback((patch: Partial<InterviewConfig>) => {
    setInterviewConfig((prev) => ({
      ...prev,
      ...patch,
      features: { ...prev.features, ...(patch.features ?? {}) },
    }));
  }, []);

  // ── Core: generate a JD from the current draft ──────────────────────────
  const generateJD = useCallback(
    async (draftForGen: JobDraft): Promise<AIGeneratedJD | null> => {
      setStep("generating");
      showTyping();
      try {
        const { min, max } = experienceToYears(draftForGen.experience);
        const jd = await apiPost<AIGeneratedJD>("/ai/generate-jd", {
          title: buildJDPrompt(draftForGen) || friendlyTitle(draftForGen),
          department: "",
          experience_min: min,
          experience_max: max,
          experience_level: `${min}-${max} Years`,
          job_type: "Full-time",
          location: draftForGen.location || "",
        });
        clearTyping();
        setGeneratedJD(jd);
        setStep("preview");
        setMessages((m) => [
          ...m,
          { id: uid(), role: "assistant", type: "preview", jd, draft: draftForGen, ts: Date.now() },
        ]);
        addAssistantText(
          setMessages,
          "Here's a draft. Reply \"yes\" to create it, or tell me what to change (e.g. \"make it remote\", \"senior level\", \"add Kubernetes\").",
        );
        return jd;
      } catch (err) {
        clearTyping();
        setStep("error");
        const msg =
          err instanceof ApiError ? err.detail : err instanceof Error ? err.message : String(err);
        addAssistantText(
          setMessages,
          `Couldn't generate the draft just now — ${msg}. Want me to try again?`,
        );
        return null;
      }
    },
    [showTyping, clearTyping],
  );

  // ── Core: send a message ────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Optimistic user bubble
      setMessages((m) => [
        ...m,
        { id: uid(), role: "user", type: "text", content: trimmed, ts: Date.now() },
      ]);

      // Small helper: advance through remaining slots with the right prompt
      const askNextSlotOrGenerate = async (next: JobDraft) => {
        const missing = missingSlots(next);
        if (missing.length === 0) {
          await generateJD(next);
        } else {
          setStep("collecting");
          addAssistantText(setMessages, SLOT_PROMPTS[missing[0]]);
        }
      };

      // Route by current step
      if (step === "idle") {
        const intent = parseIntent(trimmed);
        if (intent.kind !== "create_job") {
          addAssistantText(
            setMessages,
            "I'm focused on job creation right now. Try something like \"Create a Senior React developer job\" or \"Hire a backend engineer, remote\".",
          );
          return;
        }
        const slots = extractSlots(trimmed);
        const next: JobDraft = { role: intent.role, ...slots };
        setDraft(next);

        const missing = missingSlots(next);
        if (missing.length === 0) {
          await generateJD(next);
        } else {
          setStep("collecting");
          addAssistantText(
            setMessages,
            `Got it — drafting a ${friendlyTitle(next)}. ${SLOT_PROMPTS[missing[0]]}`,
          );
        }
        return;
      }

      if (step === "collecting") {
        // Treat the whole message as a slot answer. Try structured extraction
        // first; if nothing matched and we're waiting on location, fall back
        // to using the raw text as the location.
        const slots = extractSlots(trimmed);
        const next: JobDraft = { ...draft, ...slots };
        if (!next.location && /^[a-z][a-z\s,.-]{1,40}$/i.test(trimmed)) {
          // Very short free-text answer → likely a city/country
          next.location = trimmed.trim().replace(/\b\w/g, (c) => c.toUpperCase());
        }
        setDraft(next);
        await askNextSlotOrGenerate(next);
        return;
      }

      if (step === "preview") {
        // Confirmation — very permissive
        if (/^(yes|y|yep|yeah|sure|ok(ay)?|confirm|create|do it|go|ship it|looks good|perfect)\b/i.test(trimmed)) {
          confirmCreate();
          return;
        }
        // Treat anything else as a refinement → merge slots + regenerate
        const slots = extractSlots(trimmed);
        const next: JobDraft = { ...draft, ...slots };
        const intent = parseIntent(trimmed);
        if (intent.kind === "create_job" && intent.role) next.role = intent.role;
        setDraft(next);
        await generateJD(next);
        return;
      }

      if (step === "configuring") {
        addAssistantText(
          setMessages,
          "Interview settings are in the panel below the chat — tweak and hit **Create Job**.",
        );
        return;
      }

      if (step === "success" || step === "error") {
        const intent = parseIntent(trimmed);
        if (intent.kind === "create_job") {
          const slots = extractSlots(trimmed);
          const next: JobDraft = { role: intent.role, ...slots };
          setDraft(next);
          setGeneratedJD(null);
          setInterviewConfig(defaultConfig(next));
          if (missingSlots(next).length === 0) {
            await generateJD(next);
          } else {
            setStep("collecting");
            addAssistantText(
              setMessages,
              `New role — ${friendlyTitle(next)}. ${SLOT_PROMPTS[missingSlots(next)[0]]}`,
            );
          }
        } else {
          addAssistantText(
            setMessages,
            "Want me to start a new job? Try \"Create a Senior backend engineer, remote\".",
          );
        }
        return;
      }

      addAssistantText(setMessages, "Working on it — one sec…");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, draft, generateJD],
  );

  // ── Step transition: user approves preview → show config panel ──────────
  const confirmCreate = useCallback(() => {
    if (!generatedJD) {
      addAssistantText(setMessages, "I don't have a draft ready yet. Tell me what role to create.");
      return;
    }
    // Seed the config with smart defaults based on the role
    setInterviewConfig(defaultConfig(draft));
    setStep("configuring");
    addAssistantText(
      setMessages,
      "Almost there — pick the interview settings below and hit **Create Job** when you're happy.",
    );
  }, [generatedJD, draft]);

  // ── Finalize: actually POST the job with the chosen interview config ────
  const finalizeCreate = useCallback(
    async (config: InterviewConfig) => {
      if (!generatedJD) {
        addAssistantText(setMessages, "I don't have a draft ready yet. Tell me what role to create.");
        return;
      }
      setInterviewConfig(config);
      setStep("creating");
      showTyping();

      // Quota re-check right before the POST in case the org's limit was hit
      // while the drawer was open.
      try {
        const quota = await api<{ allowed: boolean; message?: string }>("/jobs/can-create");
        if (!quota.allowed) {
          clearTyping();
          setStep("configuring");
          const msg =
            quota.message ||
            "You have exceeded the job limit. Please upgrade your plan to create more openings.";
          addAssistantText(setMessages, `${msg} — nothing was created.`);
          notifyError(msg);
          return;
        }
      } catch {
        // Check failed (network) — fall through and let the POST surface whatever error
      }

      try {
        const CRITERIA_MAP: Record<1 | 2 | 3, "All Mandatory" | "At Least One" | "None"> = {
          1: "All Mandatory",
          2: "At Least One",
          3: "None",
        };

        const mappedSkills = (generatedJD.skill_groups ?? []).flatMap((group: AISkillGroup) =>
          (group.skills ?? []).map((skill) => ({
            name: group.name,
            skill,
            skill_criteria: CRITERIA_MAP[group.criteria] ?? "All Mandatory",
          })),
        );

        const payload = {
          title: generatedJD.title,
          department: "",
          location: draft.location || "",
          job_type: "Full-time",
          experience_level: `${generatedJD.experience_min}-${generatedJD.experience_max} Years`,
          experience_min: generatedJD.experience_min,
          experience_max: generatedJD.experience_max,
          openings: 1,
          emp_type: "Permanent",
          status: "Open",
          responsibilities: (generatedJD.responsibilities ?? [])
            .filter((r) => r && r.trim().length > 0)
            .map((r) => ({ description: r.trim() })),
          skills: mappedSkills,
          interview_settings: {
            code_editor_required: config.features.codeEditor,
            resume_based: config.features.resumeBased,
            virtual_avatar: config.features.virtualAvatar,
            allow_mobile: config.features.allowMobile,
            face_match: config.features.faceMatch,
            webcam_required: config.features.webcamRequired,
            secondary_cam: config.features.secondaryCam,
            mode: config.mode,
            max_questions: config.maxQuestions,
            auto_skip_timeout: 0,
            special_instructions: generatedJD.special_instructions || "",
            scoring: "Standard Evaluation",
            manual_interview: config.features.manualInterview,
          },
          manager_name: "",
          manager_phone: "",
          manager_email: "",
          evaluation_scoring: "Standard Evaluation",
          mix_of_questions: "mix",
          questions: [],
          allow_to_contact: false,
          upload_jd: "",
        };

        const created = await api<{ id: number; ref: string; title: string }>("/jobs/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        // Broadcast so any listening list (JobOpeningsCard, etc.) refreshes in place
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("job:created", { detail: created }));
        }

        clearTyping();
        setStep("success");
        setMessages((m) => [
          ...m,
          {
            id: uid(),
            role: "assistant",
            type: "success",
            jobRef: created.ref,
            jobTitle: created.title,
            ts: Date.now(),
          },
        ]);
        notifySuccess(`${created.title} created successfully`);
      } catch (err) {
        clearTyping();
        setStep("error");
        const msg =
          err instanceof ApiError ? err.detail : err instanceof Error ? err.message : String(err);
        addAssistantText(setMessages, `Couldn't create the job — ${msg}. Want me to try again?`);
        notifyError("Job creation failed");
      }
    },
    [generatedJD, draft, showTyping, clearTyping],
  );

  // Suppress unused-warning on router — kept for future nav actions
  void router;

  return (
    <AIAssistantContext.Provider
      value={{
        open,
        messages,
        step,
        draft,
        generatedJD,
        interviewConfig,
        thinking,
        openPanel,
        closePanel,
        togglePanel,
        sendMessage,
        confirmCreate,
        finalizeCreate,
        updateConfig,
        reset,
      }}
    >
      {children}
    </AIAssistantContext.Provider>
  );
}

export function useAIAssistant() {
  const ctx = useContext(AIAssistantContext);
  if (!ctx) throw new Error("useAIAssistant must be used within <AIAssistantProvider>");
  return ctx;
}
