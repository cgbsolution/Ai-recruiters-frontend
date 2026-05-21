"use client";

import React from "react";
import {
  Briefcase,
  MapPin,
  CheckCircle2,
  Users,
  Mail,
  Star,
  Bot,
  TrendingUp,
  Code,
  Calendar as CalendarIcon,
  FileText,
  Shield,
} from "lucide-react";

/**
 * Tiny visual mockups that render *inside* the tour popover. They exist
 * because a brand-new user has no real data yet — the destination page may
 * be empty, so we show a styled sample of what each feature looks like in
 * production. These are intentionally hard-coded, dependency-free, and small.
 */

// ── Hiring KPIs strip ──────────────────────────────────────────────────────
export const KpiPreview = () => (
  <div className="grid grid-cols-3 gap-1.5">
    {[
      { label: "Open", value: "12", tone: "from-indigo-500 to-purple-500" },
      { label: "Applied", value: "284", tone: "from-emerald-500 to-teal-500" },
      { label: "Hired", value: "8", tone: "from-amber-500 to-orange-500" },
    ].map((k) => (
      <div
        key={k.label}
        className="rounded-md bg-white p-1.5 text-center shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10"
      >
        <div
          className={`bg-gradient-to-r ${k.tone} bg-clip-text text-base font-bold text-transparent`}
        >
          {k.value}
        </div>
        <div className="text-[9px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {k.label}
        </div>
      </div>
    ))}
  </div>
);

// ── Hiring funnel (mini bar chart) ─────────────────────────────────────────
export const FunnelPreview = () => {
  const stages = [
    { label: "Applied", w: "100%", v: 284 },
    { label: "Screened", w: "62%", v: 176 },
    { label: "Interviewed", w: "31%", v: 88 },
    { label: "Offer", w: "9%", v: 26 },
    { label: "Hired", w: "3%", v: 8 },
  ];
  return (
    <div className="space-y-1">
      {stages.map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[10px] font-medium text-gray-600 dark:text-gray-400">
            {s.label}
          </span>
          <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
              style={{ width: s.w }}
            />
          </div>
          <span className="w-7 shrink-0 text-right text-[10px] font-bold text-gray-700 dark:text-gray-200">
            {s.v}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── AI usage donut ─────────────────────────────────────────────────────────
export const AiUsagePreview = () => (
  <div className="flex items-center gap-3">
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <circle cx="18" cy="18" r="14" fill="none" stroke="rgb(229 231 235)" strokeWidth="4" />
        <circle
          cx="18"
          cy="18"
          r="14"
          fill="none"
          stroke="url(#g)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="60 100"
        />
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-800 dark:text-gray-100">
        60%
      </div>
    </div>
    <div className="space-y-0.5 text-[11px]">
      <div className="font-semibold text-gray-800 dark:text-gray-100">12,450 credits used</div>
      <div className="text-gray-500 dark:text-gray-400">of 20,000 / month</div>
      <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <TrendingUp className="h-2.5 w-2.5" /> Resume scoring (62%)
      </div>
    </div>
  </div>
);

// ── Job opening card ───────────────────────────────────────────────────────
export const JobCardPreview = () => (
  <div className="rounded-md bg-white p-2.5 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10">
    <div className="mb-1 flex items-center gap-1.5">
      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        ACTIVE
      </span>
      <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
        HYBRID
      </span>
    </div>
    <div className="text-[12px] font-bold text-gray-900 dark:text-white">Senior React Engineer</div>
    <div className="mt-1 space-y-0.5 text-[10px] text-gray-500 dark:text-gray-400">
      <div className="flex items-center gap-1">
        <Briefcase className="h-2.5 w-2.5" /> Engineering · Full-time
      </div>
      <div className="flex items-center gap-1">
        <MapPin className="h-2.5 w-2.5" /> Bangalore, IN
      </div>
      <div className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
        <span className="font-semibold">$120k–$160k</span>
      </div>
    </div>
  </div>
);

// ── Candidate row with score ───────────────────────────────────────────────
export const CandidateRowPreview = () => {
  const rows = [
    { name: "Priya Sharma", email: "priya.s@gmail.com", score: 8.7, badge: "Top match" },
    { name: "Rahul Mehta", email: "rahul.m@gmail.com", score: 7.4, badge: "Strong" },
    { name: "Ananya Iyer", email: "ananya@gmail.com", score: 5.2, badge: "Average" },
  ];
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div
          key={r.name}
          className="flex items-center gap-2 rounded-md bg-white p-1.5 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-[10px] font-bold text-white">
            {r.name
              .split(" ")
              .map((p) => p[0])
              .join("")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold text-gray-900 dark:text-white">
              {r.name}
            </div>
            <div className="truncate text-[10px] text-gray-500 dark:text-gray-400">{r.email}</div>
          </div>
          <div
            className={`shrink-0 text-[11px] font-bold ${
              r.score >= 8
                ? "text-emerald-600 dark:text-emerald-400"
                : r.score >= 6
                ? "text-amber-600 dark:text-amber-400"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {r.score}/10
          </div>
        </div>
      ))}
    </div>
  );
};

// ── AI Assistant chat ──────────────────────────────────────────────────────
export const AiAssistantPreview = () => (
  <div className="space-y-1.5">
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-md rounded-tr-sm bg-indigo-500 px-2 py-1 text-[10.5px] text-white">
        Show me top 3 candidates for the React role
      </div>
    </div>
    <div className="flex items-start gap-1.5">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white">
        <Bot className="h-2.5 w-2.5" />
      </div>
      <div className="max-w-[80%] rounded-md rounded-tl-sm bg-white px-2 py-1 text-[10.5px] text-gray-700 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:text-gray-300 dark:ring-white/10">
        Here are your top 3: <b>Priya Sharma (8.7)</b>, <b>Rahul Mehta (7.4)</b> and <b>Ankit Roy (7.1)</b> — Priya scored highest on system design.
      </div>
    </div>
  </div>
);

// ── Question bank item ─────────────────────────────────────────────────────
export const QuestionBankPreview = () => (
  <div className="space-y-1">
    {[
      { type: "TECH", q: "Explain useMemo vs useCallback in React.", diff: "Medium" },
      { type: "BEHAV", q: "Tell me about a time you missed a deadline.", diff: "Easy" },
      { type: "CODE", q: "Reverse a linked list in-place.", diff: "Hard" },
    ].map((it) => (
      <div
        key={it.q}
        className="flex items-start gap-1.5 rounded-md bg-white p-1.5 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10"
      >
        <Code className="mt-0.5 h-3 w-3 shrink-0 text-indigo-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="rounded bg-indigo-100 px-1 py-px text-[8px] font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
              {it.type}
            </span>
            <span className="text-[9px] text-gray-500 dark:text-gray-400">{it.diff}</span>
          </div>
          <div className="text-[10.5px] text-gray-800 dark:text-gray-200">{it.q}</div>
        </div>
      </div>
    ))}
  </div>
);

// ── Resume DB search ───────────────────────────────────────────────────────
export const ResumeDbPreview = () => (
  <div className="space-y-1.5">
    <div className="rounded-md bg-white px-2 py-1.5 text-[10.5px] text-gray-600 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:text-gray-300 dark:ring-white/10">
      <span className="text-gray-400 dark:text-gray-500">🔍 </span>
      <span className="italic">5 yrs React + GraphQL, Bangalore</span>
    </div>
    <div className="flex items-center gap-1.5 text-[10px] text-gray-600 dark:text-gray-400">
      <Users className="h-3 w-3 text-indigo-500" />
      <span>
        <b className="text-gray-900 dark:text-white">147 matches</b> — top: Priya S. (97%),
        Rahul M. (92%), Ankit R. (88%)
      </span>
    </div>
  </div>
);

// ── Access control roles ───────────────────────────────────────────────────
export const AccessControlPreview = () => (
  <div className="space-y-1">
    {[
      { name: "Deepak Rawat", role: "Super Admin", tone: "from-purple-500 to-indigo-500" },
      { name: "Anita Kumar", role: "Admin", tone: "from-indigo-500 to-blue-500" },
      { name: "Vikram Patil", role: "Recruiter", tone: "from-emerald-500 to-teal-500" },
    ].map((u) => (
      <div
        key={u.name}
        className="flex items-center justify-between rounded-md bg-white p-1.5 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10"
      >
        <div className="flex items-center gap-1.5">
          <Shield className="h-3 w-3 text-indigo-500" />
          <span className="text-[10.5px] font-medium text-gray-800 dark:text-gray-200">{u.name}</span>
        </div>
        <span
          className={`bg-gradient-to-r ${u.tone} rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-white`}
        >
          {u.role}
        </span>
      </div>
    ))}
  </div>
);

// ── Calendar slots ─────────────────────────────────────────────────────────
export const CalendarPreview = () => (
  <div className="space-y-1">
    {[
      { time: "Mon · 10:00 AM", who: "Priya Sharma · React Round 1" },
      { time: "Mon · 2:30 PM", who: "Rahul Mehta · React Round 2" },
      { time: "Tue · 11:00 AM", who: "Ankit Roy · System Design" },
    ].map((s) => (
      <div
        key={s.time}
        className="flex items-center gap-1.5 rounded-md bg-white p-1.5 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10"
      >
        <CalendarIcon className="h-3 w-3 shrink-0 text-indigo-500" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold text-gray-900 dark:text-white">{s.time}</div>
          <div className="truncate text-[10px] text-gray-500 dark:text-gray-400">{s.who}</div>
        </div>
        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
      </div>
    ))}
  </div>
);

// ── File manager ───────────────────────────────────────────────────────────
export const FileManagerPreview = () => (
  <div className="grid grid-cols-3 gap-1.5">
    {[
      { name: "JDs", count: 24 },
      { name: "Resumes", count: 142 },
      { name: "Offers", count: 8 },
    ].map((f) => (
      <div
        key={f.name}
        className="rounded-md bg-white p-1.5 text-center shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10"
      >
        <FileText className="mx-auto h-4 w-4 text-indigo-500" />
        <div className="text-[10px] font-bold text-gray-900 dark:text-white">{f.count}</div>
        <div className="text-[9px] text-gray-500 dark:text-gray-400">{f.name}</div>
      </div>
    ))}
  </div>
);

// ── Profile card ───────────────────────────────────────────────────────────
export const ProfilePreview = () => (
  <div className="flex items-center gap-2 rounded-md bg-white p-2 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-[11px] font-bold text-white">
      DR
    </div>
    <div className="min-w-0 flex-1">
      <div className="truncate text-[11px] font-semibold text-gray-900 dark:text-white">Deepak Rawat</div>
      <div className="flex items-center gap-1 text-[9.5px] text-gray-500 dark:text-gray-400">
        <Mail className="h-2.5 w-2.5" />
        deepak.rawat@cgbindia.com
      </div>
    </div>
    <Star className="h-3 w-3 shrink-0 text-amber-500" />
  </div>
);
