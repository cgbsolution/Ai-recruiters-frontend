/**
 * Shared types + status config for the interview Calendar.
 *
 * The backend (`GET /calendar/interviews`) already scopes results to the
 * logged-in tenant and returns a normalized status `category`; this module just
 * maps each category to its colors/labels and provides the small date helpers
 * the calendar needs.
 */

/** Normalized status categories returned by the backend. */
export type StatusCategory =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "no_show";

/** One scheduled interview, as returned by `GET /calendar/interviews`. */
export interface CalendarInterview {
  id: number;
  candidate_id: number;
  candidate_name: string;
  candidate_email: string | null;
  job_id: number | null;
  job_title: string | null;
  department: string | null;
  round: string | null;
  interviewer: string | null;
  status: string; // raw, free-text status for display
  category: StatusCategory;
  interview_date: string | null; // naive UTC ISO (no trailing Z)
  interview_timezone: string | null;
  meeting_link: string | null;
}

export interface StatusMeta {
  /** Human label shown on badges/legend. */
  label: string;
  /** Solid accent colour (hex) — event left-border + legend dot. */
  color: string;
  /** Tint background for the event chip (hex). */
  bg: string;
  /** Tailwind classes for a pill badge (popup, legend, filters). */
  badge: string;
  /** Tailwind classes for the small solid dot used in summaries. */
  dot: string;
}

/**
 * Status → presentation. Colours are deliberately distinct and accessible:
 * blue (upcoming), amber (live), green (done), slate (cancelled),
 * violet (rescheduled), rose (no-show).
 */
export const STATUS_META: Record<StatusCategory, StatusMeta> = {
  scheduled: {
    label: "Scheduled",
    color: "#3b82f6",
    bg: "#eff6ff",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  in_progress: {
    label: "In Progress",
    color: "#f59e0b",
    bg: "#fffbeb",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  completed: {
    label: "Completed",
    color: "#22c55e",
    bg: "#f0fdf4",
    badge: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",
    dot: "bg-green-500",
  },
  cancelled: {
    label: "Cancelled",
    color: "#94a3b8",
    bg: "#f8fafc",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
    dot: "bg-slate-400",
  },
  rescheduled: {
    label: "Rescheduled",
    color: "#8b5cf6",
    bg: "#f5f3ff",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  no_show: {
    label: "No Show",
    color: "#f43f5e",
    bg: "#fff1f2",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
    dot: "bg-rose-500",
  },
};

/** Stable order for legends, filters, and summary rows. */
export const STATUS_ORDER: StatusCategory[] = [
  "scheduled",
  "in_progress",
  "completed",
  "rescheduled",
  "no_show",
  "cancelled",
];

export function statusMeta(category: string): StatusMeta {
  return STATUS_META[category as StatusCategory] ?? STATUS_META.scheduled;
}

/** Map a friendly timezone name to its IANA id (mirrors CandidatesView). */
const TZ_MAP: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Kolkata": "Asia/Kolkata",
  IST: "Asia/Kolkata",
};

/**
 * The backend stores `interview_date` as NAIVE UTC (no offset). FullCalendar
 * and `new Date()` would otherwise read it as *local* time and shift the event.
 * Force UTC by appending "Z" when no offset is present.
 */
export function toUtcIso(date: string | null): string | null {
  if (!date) return null;
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(date);
  return hasTz ? date : `${date}Z`;
}

/**
 * Format a scheduled interview moment in the candidate's own timezone, e.g.
 * "Fri, Jun 12, 2025, 10:00 AM (Asia/Calcutta)". Falls back to browser tz.
 */
export function formatInterviewMoment(
  date: string | null,
  tz: string | null,
): string {
  const iso = toUtcIso(date);
  if (!iso) return "—";
  const ianaZone = tz ? TZ_MAP[tz] || tz : undefined;
  const formatted = new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ianaZone,
  });
  return `${formatted}${tz ? ` (${tz})` : ""}`;
}

/** Per-day rollup used by the day-cell summary. */
export interface DaySummary {
  total: number;
  completed: number;
  cancelled: number;
  pending: number; // total − completed − cancelled
}

/** Build a `YYYY-MM-DD` (browser-local) → summary map from the interview list. */
export function buildDaySummaries(
  interviews: CalendarInterview[],
): Record<string, DaySummary> {
  const map: Record<string, DaySummary> = {};
  for (const iv of interviews) {
    const iso = toUtcIso(iv.interview_date);
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    // Local Y-M-D — matches the cell FullCalendar renders the event in.
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    const s = (map[key] ??= { total: 0, completed: 0, cancelled: 0, pending: 0 });
    s.total += 1;
    if (iv.category === "completed") s.completed += 1;
    else if (iv.category === "cancelled") s.cancelled += 1;
  }
  for (const key of Object.keys(map)) {
    const s = map[key];
    s.pending = s.total - s.completed - s.cancelled;
  }
  return map;
}
