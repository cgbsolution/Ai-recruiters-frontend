import React from "react";
import type { UserRole } from "@/context/AuthContext";
import {
  KpiPreview,
  FunnelPreview,
  AiUsagePreview,
  JobCardPreview,
  CandidateRowPreview,
  AiAssistantPreview,
  QuestionBankPreview,
  ResumeDbPreview,
  AccessControlPreview,
  CalendarPreview,
  FileManagerPreview,
  ProfilePreview,
} from "./step-previews";

export type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

export interface TourStep {
  /** CSS selector for the element to highlight. Omit for a centered modal step. */
  target?: string;
  /** Optional route to navigate to before showing the step. */
  route?: string;
  title: string;
  description: string;
  /** Defaults to "bottom". */
  placement?: TourPlacement;
  /** Restrict to certain roles — step is skipped for users not in this list. */
  roles?: UserRole[];
  /**
   * Inline mock preview rendered inside the popover. Crucial for empty pages:
   * a new user has no real data yet, so the preview shows what each feature
   * looks like with real content.
   */
  preview?: React.ReactNode;
}

const h = React.createElement;

const ALL_STEPS: TourStep[] = [
  // ── Intro ──────────────────────────────────────────────────────────────────
  {
    title: "Welcome to AI Recruiter 👋",
    description:
      "A quick tour of your hiring command-center. We'll walk through every feature so you know exactly what's here and how to use it. You can replay this anytime from the dashboard.",
    placement: "center",
    route: "/",
  },

  // ── Sidebar overview ───────────────────────────────────────────────────────
  {
    target: '[data-tour="sidebar"]',
    title: "Sidebar navigation",
    description:
      "Everything lives in the left sidebar — Dashboard, Job Openings, Candidates, Question Bank and more. Hover over the collapsed icons to see their label.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-dashboard"]',
    title: "Dashboard",
    description:
      "Your home base. Hiring funnel, AI insights, candidate distribution and open positions — all in one snapshot. Refreshes in real time.",
    placement: "right",
  },

  // ── Dashboard widgets ──────────────────────────────────────────────────────
  {
    target: '[data-tour="dashboard-header"]',
    title: "Welcome banner",
    description:
      "A personalised greeting plus quick actions: launch the AI Assistant or create a new opening without leaving this page.",
    placement: "bottom",
    route: "/",
  },
  {
    target: '[data-tour="ai-assistant-btn"]',
    title: "AI Assistant",
    description:
      "Ask anything in natural language — \"show me top 5 candidates for backend role\" or \"draft a JD for senior React engineer\". The assistant has full context of your data.",
    placement: "bottom",
    preview: h(AiAssistantPreview),
  },
  {
    target: '[data-tour="jobs-data-card"]',
    title: "Hiring KPIs",
    description:
      "Open positions, applications received, interviews completed and conversion rates — your headline numbers at a glance. Once you create your first opening, this lights up with real data.",
    placement: "top",
    preview: h(KpiPreview),
  },
  {
    target: '[data-tour="hiring-funnel"]',
    title: "Hiring funnel",
    description:
      "See how candidates flow from applied → screened → interviewed → hired. Identify drop-off stages and bottlenecks instantly.",
    placement: "top",
    preview: h(FunnelPreview),
  },
  {
    target: '[data-tour="ai-usage"]',
    title: "AI usage analytics",
    description:
      "Track AI credits consumed by resume parsing, scoring and interview analysis — and where your spend is going.",
    placement: "top",
    roles: ["super_admin"],
    preview: h(AiUsagePreview),
  },

  // ── Job Openings ───────────────────────────────────────────────────────────
  {
    target: '[data-tour="nav-job-openings"]',
    title: "Job Openings",
    description:
      "Next up — let's look at how you create and manage open positions. Click anywhere to continue.",
    placement: "right",
  },
  {
    target: '[data-tour="job-openings-page"]',
    title: "All your positions",
    description:
      "Every active and closed opening lives here. Search by title, filter by department, status or work-type. Below is what each opening card looks like.",
    placement: "right",
    route: "/job-openings",
    preview: h(JobCardPreview),
  },
  {
    target: '[data-tour="create-opening-cta-sidebar"]',
    title: "Create a new opening",
    description:
      "Click here to create a position. You can write the JD manually, paste a job URL, or let the AI draft one from a short description.",
    placement: "right",
  },

  // ── Candidates ─────────────────────────────────────────────────────────────
  {
    target: '[data-tour="nav-candidates"]',
    title: "Candidates",
    description:
      "Every applicant across every position lives in one searchable list — let's take a look.",
    placement: "right",
  },
  {
    target: '[data-tour="candidates-page"]',
    title: "Candidate profiles",
    description:
      "Each candidate has an AI-generated resume summary, an interview score (0–10), recorded video answers and behavioural flags. Click any name to drill in. Below is what a typical row looks like.",
    placement: "right",
    route: "/candidates",
    preview: h(CandidateRowPreview),
  },

  // ── Question Bank ──────────────────────────────────────────────────────────
  {
    target: '[data-tour="nav-question-bank"]',
    title: "Question Bank",
    description:
      "A library of interview questions you can reuse across roles — technical, behavioural, role-specific. The AI can also generate fresh ones for you.",
    placement: "right",
  },
  {
    target: '[data-tour="question-bank-page"]',
    title: "Browse & generate questions",
    description:
      "Filter by skill, difficulty or type. Mark favourites, edit wording, or attach questions to a specific opening or interview round.",
    placement: "right",
    route: "/question-bank",
    preview: h(QuestionBankPreview),
  },

  // ── Resume Database ────────────────────────────────────────────────────────
  {
    target: '[data-tour="nav-resume-database"]',
    title: "Resume Database",
    description:
      "A central pool of every resume ever uploaded. Run semantic search like \"5 yrs React + GraphQL in Bangalore\" — the AI finds matches even if exact keywords differ.",
    placement: "right",
    roles: ["super_admin", "admin"],
    preview: h(ResumeDbPreview),
  },
  {
    target: '[data-tour="resume-database-page"]',
    title: "Semantic resume search",
    description:
      "Upload bulk resumes once and reuse them across openings forever. Combine filters with natural-language queries for laser-targeted shortlists.",
    placement: "right",
    route: "/resume-database",
    roles: ["super_admin", "admin"],
    preview: h(ResumeDbPreview),
  },

  // ── Access Control ─────────────────────────────────────────────────────────
  {
    target: '[data-tour="nav-access-control"]',
    title: "Access Control",
    description:
      "Manage who can see and do what. Add recruiters, approve new sign-ups, toggle feature permissions like Code Editor, Fit-Score or WhatsApp outreach.",
    placement: "right",
    roles: ["super_admin", "admin"],
    preview: h(AccessControlPreview),
  },
  {
    target: '[data-tour="access-control-page"]',
    title: "Team & permissions",
    description:
      "Approve pending users, change roles, revoke access in one click — full audit log included.",
    placement: "right",
    route: "/access-control",
    roles: ["super_admin", "admin"],
    preview: h(AccessControlPreview),
  },

  // ── Calendar ───────────────────────────────────────────────────────────────
  {
    target: '[data-tour="calendar-page"]',
    title: "Interview calendar",
    description:
      "Sync with Google Calendar, schedule interview slots in bulk, and let candidates self-book from the slots you publish.",
    placement: "right",
    route: "/calendar",
    preview: h(CalendarPreview),
  },

  // ── File Manager ───────────────────────────────────────────────────────────
  {
    target: '[data-tour="nav-file-manager"]',
    title: "File Manager",
    description:
      "All uploaded resumes, JDs, offer letters and supporting docs in one place. Drag-and-drop upload, preview in-browser, share by link.",
    placement: "right",
    roles: ["super_admin"],
    preview: h(FileManagerPreview),
  },

  // ── Profile & wrap-up ──────────────────────────────────────────────────────
  {
    target: '[data-tour="user-profile-card"]',
    title: "Your profile",
    description:
      "Update your name, email, password, and connect Google Calendar. Hit the avatar at the bottom of the sidebar to open it.",
    placement: "right",
    preview: h(ProfilePreview),
  },
  {
    title: "You're all set 🎉",
    description:
      "That's the tour! Click the ✨ Try a Demo button on the dashboard any time you want to replay it. Happy hiring!",
    placement: "center",
    route: "/",
  },
];

/**
 * Filter the master step list down to what the given role should see.
 */
export function getTourStepsForRole(role: UserRole): TourStep[] {
  return ALL_STEPS.filter((s) => !s.roles || s.roles.includes(role));
}
