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

// ── Loop B: jobs and matches ────────────────────────────────────────────────

export interface TalentJobRow {
  id: number;
  ref: string;
  title: string;
  location: string;
  status: string;
  autonomy_mode: "autopilot" | "copilot" | null;
  match_status: string | null;
  last_matched_at: string | null;
  matches: Record<string, number>;
}

export interface RubricCriterion {
  criterion: string;
  description: string;
  weight: number;
}

export interface JobTalentSettings {
  autonomy_mode: "autopilot" | "copilot";
  top_k: number;
  interview_mode: "async_text" | "async_voice" | "live_voice";
  question_count: number;
  time_limit_minutes: number;
  slot_minutes: number;
  budget_max_ctc: number | null;
  max_notice_days: number | null;
  relocation_ok: boolean;
  locations: string[] | null;
  must_haves: string[] | null;
  nice_to_haves: string[] | null;
  rubric: RubricCriterion[] | null;
  panel_user_ids: number[] | null;
  match_status: string | null;
  match_error: string | null;
  last_matched_at: string | null;
}

export interface TalentJob {
  id: number;
  ref: string;
  title: string;
  location: string;
  department: string;
  experience_min: number | null;
  experience_max: number | null;
  status: string;
  settings: JobTalentSettings;
  skills: string[];
  effective_must_haves: string[];
  matches: Record<string, number>;
}

export interface MustHave {
  requirement: string;
  met: "yes" | "no" | "unclear";
  evidence: string;
  evidence_verified: boolean;
}

export interface MatchItem {
  id: string;
  rank: number;
  profile_id: number;
  status: string;
  status_reason: string | null;
  ai_score: number | null;
  model_score: number | null;
  dimension_scores: Record<string, number> | null;
  stage1_score: number | null;
  vector_score: number | null;
  must_haves: MustHave[] | null;
  gaps: string[] | null;
  strengths: { strength: string; evidence: string; evidence_verified: boolean }[] | null;
  risk_flags: { flag: string; evidence: string }[] | null;
  evidence: { verified_quotes: number; unverified_quotes: number } | null;
  fields_sent: string[] | null;
  model: string | null;
  prompt_version: string | null;
  recruiter_rating: "relevant" | "not_relevant" | null;
  response: string | null;
  confirmed: Record<string, unknown> | null;
  invited_at: string | null;
  profile: {
    name: string | null;
    current_designation: string | null;
    current_company: string | null;
    experience_years: number | null;
    city: string | null;
    verification_status: string;
    last_verified_at: string | null;
    notice_period_days: number | null;
    expected_ctc: number | null;
    email_status: string | null;
    job_search_status: string | null;
  };
}

export interface PrecisionReport {
  jobs: { job_id: number; ref: string; title: string; rated_in_top_10: number; relevant_in_top_10: number; precision_at_10: number | null; precision_of_rated: number | null }[];
  jobs_fully_rated: number;
  mean_precision_at_10: number | null;
}

export interface BackfillEstimate {
  profiles: number;
  model: string;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_usd: number;
  batches: number;
  prompt_version: string;
  embeddings_missing: number;
}

export const DIMENSION_LABELS: Record<string, string> = {
  must_have_coverage: "Must-haves",
  relevant_experience: "Experience",
  skills_depth: "Skills depth",
  domain_fit: "Domain",
  trajectory: "Trajectory",
};

// ── Loops C and D ───────────────────────────────────────────────────────────

export interface ApprovalItem {
  id: string;
  kind: "invite" | "submit" | "reject_message";
  job_id: number;
  requested_at: string;
  match: MatchItem | null;
}

export interface InterviewRow {
  id: string;
  match_id: string;
  job_id: number;
  job_ref: string;
  job_title: string;
  candidate: string | null;
  profile_id: number;
  mode: string;
  status: string;
  scheduled_at: string | null;
  completed_at: string | null;
  reschedule_count: number;
  no_show_count: number;
  needs_recruiter: boolean;
  overall_score: number | null;
  human_review_status: string | null;
  ai_score: number | null;
  match_status: string;
}

export interface InvitePageData {
  organization: string;
  first_name: string;
  job: { title: string; location: string; department: string; type: string; summary: string; experience: string };
  current: { current_ctc: number | null; expected_ctc: number | null; notice_period_days: number | null };
  open: boolean;
}

export interface InterviewState {
  organization: string;
  job_title: string;
  status: string;
  mode: "async_text" | "async_voice" | "live_voice";
  question_count: number;
  time_limit_minutes: number;
  slots: { id: string; label: string; starts_at: string }[];
  scheduled_label: string | null;
  scheduled_at: string | null;
  opens_at: string | null;
  can_start: boolean;
  can_reschedule: boolean;
  needs_recruiter: boolean;
  meeting_link: string | null;
  disclosure: string;
  consented: boolean;
}
