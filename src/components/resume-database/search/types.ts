/** Resume Database search — shared types, filter state and URL syncing.
 *  Mirrors GET /resume-database/search (app/services/resume_search.py). */

export type PipelineStatus = "new" | "shortlisted" | "contacted" | "interviewing" | "on_hold" | "rejected";
export type SortKey = "relevance" | "recent" | "experience_desc" | "experience_asc" | "ctc_desc";
export type SkillsMode = "all" | "any";
export type Quality = "" | "high" | "medium" | "low";

export interface ResumeCardData {
  id: number;
  candidate_name: string | null;
  candidate_email: string | null;
  phone: string | null;
  current_designation: string | null;
  current_company: string | null;
  current_tenure_years: number | null;
  previous_company: string | null;
  experience_years: number | null;
  current_ctc: number | null;
  expected_ctc: number | null;
  location: string | null;
  city: string | null;
  open_to_relocate: boolean | null;
  notice_period_days: number | null;
  education: string | null;
  highest_education: string | null;
  skills: string[];
  skills_total: number;
  matched_skills: string[];
  parse_quality: number | null;
  parsing_status: string;
  pipeline_status: PipelineStatus;
  source: string | null;
  resume_updated_at: string | null;
  resume_file_url: string | null;
  match: number | null;
}

export interface FacetOption {
  key: string;
  label: string;
  count: number;
}

export interface Facets {
  ctc: FacetOption[];
  notice: FacetOption[];
  city: FacetOption[];
  relocate: number;
  skills: FacetOption[];
  certs: FacetOption[];
  education: FacetOption[];
  pipeline: FacetOption[];
  source: FacetOption[];
}

export interface SearchResponse {
  items: ResumeCardData[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  query: { include: string[]; exclude: string[] };
  facets: Facets | null;
}

export interface Filters {
  q: string;
  location: string;
  expMin: string;
  expMax: string;
  ctc: string[];
  notice: string[];
  city: string[];
  relocate: boolean;
  skills: string[];
  skillsMode: SkillsMode;
  certs: string[];
  education: string[];
  freshness: string;
  pipeline: string[];
  source: string[];
  quality: Quality;
  sort: SortKey;
  page: number;
}

export const EMPTY_FILTERS: Filters = {
  q: "",
  location: "",
  expMin: "",
  expMax: "",
  ctc: [],
  notice: [],
  city: [],
  relocate: false,
  skills: [],
  skillsMode: "all",
  certs: [],
  education: [],
  freshness: "",
  pipeline: [],
  source: [],
  quality: "",
  sort: "relevance",
  page: 1,
};

export const PAGE_SIZE = 20;

export const PIPELINE_LABELS: Record<PipelineStatus, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  contacted: "Contacted",
  interviewing: "Interviewing",
  on_hold: "On hold",
  rejected: "Rejected",
};

export const SOURCE_LABELS: Record<string, string> = {
  bulk_upload: "Bulk upload",
  application: "Job application",
  import: "Imported",
};

export const EDUCATION_LABELS: Record<string, string> = {
  doctorate: "Doctorate",
  postgraduate: "Post-graduate",
  graduate: "Graduate",
  diploma: "Diploma",
  school: "School (10th / 12th)",
  na: "Not specified",
};

export const FRESHNESS_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 3 months" },
  { value: "180", label: "Last 6 months" },
  { value: "365", label: "Last 12 months" },
];

export const QUALITY_OPTIONS: { value: Quality; label: string }[] = [
  { value: "", label: "All profiles" },
  { value: "high", label: "Well parsed (80%+)" },
  { value: "medium", label: "Partly parsed (50–79%)" },
  { value: "low", label: "Needs review (<50%)" },
];

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "recent", label: "Recently updated" },
  { value: "experience_desc", label: "Experience: high to low" },
  { value: "experience_asc", label: "Experience: low to high" },
  { value: "ctc_desc", label: "CTC: high to low" },
];

export const EXPERIENCE_PRESETS: { label: string; min: string; max: string }[] = [
  { label: "0 to 2", min: "0", max: "2" },
  { label: "3 to 5", min: "3", max: "5" },
  { label: "6 to 10", min: "6", max: "10" },
  { label: "10+", min: "10", max: "" },
];

// ── URL <-> filters (so a search can be bookmarked, shared, and survives reload) ──

const LIST_KEYS = ["ctc", "notice", "city", "skills", "certs", "education", "pipeline", "source"] as const;

export function filtersToParams(f: Filters, forApi: boolean): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.location.trim()) p.set("location", f.location.trim());
  if (f.expMin !== "") p.set("exp_min", f.expMin);
  if (f.expMax !== "") p.set("exp_max", f.expMax);
  for (const key of LIST_KEYS) f[key].forEach((v) => p.append(key, v));
  if (f.relocate) p.set("relocate", "true");
  if (f.skills.length && f.skillsMode === "any") p.set("skills_mode", "any");
  if (f.freshness) p.set("freshness", f.freshness);
  if (f.quality) p.set("quality", f.quality);
  if (f.sort !== "relevance") p.set("sort", f.sort);
  if (f.page > 1) p.set("page", String(f.page));
  if (forApi) p.set("page_size", String(PAGE_SIZE));
  return p;
}

export function filtersFromParams(p: URLSearchParams): Filters {
  const num = (v: string | null) => (v && !Number.isNaN(Number(v)) ? v : "");
  const sort = p.get("sort") as SortKey | null;
  const quality = p.get("quality") as Quality | null;
  const f: Filters = {
    ...EMPTY_FILTERS,
    q: p.get("q") ?? "",
    location: p.get("location") ?? "",
    expMin: num(p.get("exp_min")),
    expMax: num(p.get("exp_max")),
    relocate: p.get("relocate") === "true",
    skillsMode: p.get("skills_mode") === "any" ? "any" : "all",
    freshness: num(p.get("freshness")),
    quality: quality && ["high", "medium", "low"].includes(quality) ? quality : "",
    sort: sort && SORT_OPTIONS.some((o) => o.value === sort) ? sort : "relevance",
    page: Math.max(1, parseInt(p.get("page") || "1", 10) || 1),
  };
  for (const key of LIST_KEYS) f[key] = p.getAll(key).slice(0, 30);
  return f;
}

/** True when anything besides sort/page narrows the results. */
export function hasActiveFilters(f: Filters): boolean {
  return (
    !!f.q.trim() ||
    !!f.location.trim() ||
    f.expMin !== "" ||
    f.expMax !== "" ||
    f.relocate ||
    !!f.freshness ||
    !!f.quality ||
    LIST_KEYS.some((k) => f[k].length > 0)
  );
}
