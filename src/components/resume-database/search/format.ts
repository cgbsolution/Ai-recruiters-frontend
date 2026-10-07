/** Display helpers for Resume Database cards. */

export function initials(name: string | null): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

const AVATAR_TONES = [
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-200",
];

/** Stable colour per person, so the same candidate always looks the same. */
export function avatarTone(seed: string | number): string {
  const text = String(seed);
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

export function years(n: number | null): string | null {
  if (n == null) return null;
  if (n === 0) return "Fresher";
  if (n < 1) return `${Math.max(1, Math.round(n * 12))} mos`;
  return `${trimNumber(n)} yr${n === 1 ? "" : "s"}`;
}

export function tenure(n: number | null): string | null {
  if (n == null) return null;
  if (n < 1) return `${Math.max(1, Math.round(n * 12))} mos there`;
  return `${trimNumber(n)} yr${n === 1 ? "" : "s"} there`;
}

export function lpa(n: number | null): string | null {
  return n == null ? null : `₹${trimNumber(n)} LPA`;
}

export function noticeLabel(days: number | null): string | null {
  if (days == null) return null;
  if (days === 0) return "Immediate joiner";
  return `${days} days notice`;
}

export function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  // The API sends naive UTC timestamps.
  const then = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const yrs = Math.floor(days / 365);
  return `${yrs} year${yrs === 1 ? "" : "s"} ago`;
}

export function qualityTone(q: number | null): string {
  if (q == null) return "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300";
  if (q >= 80) return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30";
  if (q >= 50) return "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30";
  return "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30";
}

export const PIPELINE_TONES: Record<string, string> = {
  new: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-gray-300",
  shortlisted: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
  contacted: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
  interviewing: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  on_hold: "bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
};
