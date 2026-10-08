/**
 * Talent Agent API client and types.
 *
 * Admin calls go to /talent/...; a platform admin with no organization must
 * name one, so every admin call goes through talentApi(), which appends the
 * organization chosen in TalentOrgContext (components/talent/TalentOrg.tsx).
 * Candidate pages call /talent/public/... with the token from their link and
 * no login (skipAuth).
 */
import { api, apiPost, API_BASE } from "@/lib/api";

let currentOrgId: number | null = null;

export function setTalentOrg(id: number | null) {
  currentOrgId = id;
}

function withOrg(path: string): string {
  if (currentOrgId == null) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}organization_id=${currentOrgId}`;
}

export function talentGet<T>(path: string): Promise<T> {
  return api<T>(withOrg(`/talent${path}`));
}

export function talentPost<T>(path: string, body: unknown): Promise<T> {
  return apiPost<T>(withOrg(`/talent${path}`), body);
}

export function talentPut<T>(path: string, body: unknown): Promise<T> {
  return api<T>(withOrg(`/talent${path}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function talentDelete<T>(path: string): Promise<T> {
  return api<T>(withOrg(`/talent${path}`), { method: "DELETE" });
}

// Candidate pages: no login, the token is the credential.
export function publicGet<T>(path: string): Promise<T> {
  return api<T>(`/talent/public${path}`, { skipAuth: true });
}

export function publicPost<T>(path: string, body: unknown): Promise<T> {
  return apiPost<T>(`/talent/public${path}`, body, { skipAuth: true });
}

export async function publicUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  return api<T>(`/talent/public${path}`, { method: "POST", body: form, skipAuth: true, timeout: 120_000 });
}

export function publicUrl(path: string): string {
  return `${API_BASE}/talent/public${path}`;
}

// ── Types ───────────────────────────────────────────────────────────────────

export const LOOP_LABELS: Record<string, { label: string; help: string }> = {
  refresh: { label: "Loop A · Refresh", help: "Ask candidates to re-confirm their profile every six months." },
  refresh_rolling: {
    label: "Refresh everyone who is due",
    help: "Off: only pilot campaigns send. On: the daily sweep enrolls every due profile, highest priority first.",
  },
  match: { label: "Loop B · Match", help: "Rank the talent pool when a job is created or changed." },
  invite: { label: "Loop C · Invite", help: "Invite the top matches (copilot jobs wait for your approval)." },
  interview: { label: "Loop D · Interview", help: "Schedule, run and score first-round AI interviews." },
  live_voice: { label: "Live voice interviews", help: "Phase 5: the real-time voice interviewer. Keep off until async interviews are trusted." },
  retention: { label: "Retention deletes", help: "Delete profiles whose retention date has passed. Off: they are only reported." },
};

export interface TalentSettings {
  flags: Record<string, boolean>;
  agent_enabled: boolean;
  timezone: string;
  quiet_hours_start: number;
  quiet_hours_end: number;
  refresh_after_days: number;
  retention_months: number;
  default_autonomy: "autopilot" | "copilot";
  sender_domain: string;
  consent_text: string;
  send_ramp: { from_day: number; cap: number }[];
  models: Record<string, string>;
  embedding_provider: string | null;
  warnings: string[];
}

export interface Funnel {
  members: number;
  members_by_status: Record<string, number>;
  sent: number;
  messages_sent: number;
  opened: number;
  refreshed: number;
  unreachable: number;
  opted_out: number;
  no_response: number;
  touches: Record<string, Record<string, number>>;
  skipped_reasons: Record<string, number>;
  health: Health;
}

export interface Health {
  sent: number;
  bounces: number;
  complaints: number;
  bounce_rate: number;
  complaint_rate: number;
}

export interface CampaignRow {
  id: string;
  kind: string;
  name: string;
  status: "active" | "paused" | "completed" | "cancelled";
  job_id: number | null;
  segment: { type?: string; size?: number; strata?: { label: string; eligible: number; selected: number }[] } | null;
  paused_reason: string | null;
  created_at: string;
  funnel: Funnel;
}

export interface Segments {
  profiles: number;
  by_verification_status: Record<string, number>;
  refresh_consent: number;
  due_now: number;
  cv_age_months: Record<string, number>;
}

export interface Deliverability {
  usage_today: { domain: string; day: string; cap: number; bulk_cap: number; total: number; bulk: number; paused: boolean; paused_reason: string | null };
  ramp_started_on: string;
  ramp: { from_day: number; cap: number }[];
  forecast: { day: string; cap: number }[];
  domain_health_7d: Health;
  thresholds: { bounce_rate: number; complaint_rate: number; min_sample: number };
}

export interface Phase0Report {
  profiles: number;
  email_status: Record<string, number>;
  invalid_or_unusable_emails: number;
  duplicates: {
    same_email: { groups: number; rows: number; removable: number; sample: number[][] };
    same_phone_different_email: { groups: number; rows: number; sample: number[][]; note: string };
    same_file: { groups: number; rows: number; sample: number[][] };
  };
  freshness: Record<string, number>;
}

export interface AuditItem {
  id: number;
  at: string;
  actor: string;
  action: string;
  subject_type: string;
  subject_id: string | null;
  profile_id: number | null;
  detail: Record<string, unknown> | null;
}

export interface AuditPage {
  total: number;
  page: number;
  page_size: number;
  actions: string[];
  actors: string[];
  items: AuditItem[];
}

export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

export function fmtDate(iso?: string | null, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  return withTime
    ? d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
