"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, FileText, Loader2, Mail, MoreHorizontal, Pencil, RefreshCw, Trash2, UserPlus, X } from "lucide-react";
import { api, apiPost } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import AddToOpeningModal from "./AddToOpeningModal";
import CvViewerModal from "./CvViewerModal";
import { PIPELINE_LABELS, type PipelineStatus } from "./types";
import { PIPELINE_TONES, avatarTone, initials, lpa, timeAgo } from "./format";

export interface ResumeDetail {
  id: number;
  candidate_email: string;
  candidate_name: string | null;
  phone: string | null;
  current_designation: string | null;
  current_company: string | null;
  experience_years: number | null;
  skills: string[];
  education: string[];
  certifications?: string[];
  work_experience?: { title?: string; company?: string; duration?: string; description?: string }[];
  location: string | null;
  city: string | null;
  annual_package: number | null;
  current_ctc: number | null;
  expected_ctc: number | null;
  notice_period_days: number | null;
  open_to_relocate: boolean | null;
  highest_education: string | null;
  summary: string | null;
  raw_text?: string | null;
  parsing_status: string;
  parsing_error: string | null;
  parse_quality: number | null;
  pipeline_status: PipelineStatus;
  recruiter_fields?: string[];
  source: string | null;
  parsed_at: string | null;
  created_at: string | null;
  resume_file_url: string | null;
}

interface ProfileDrawerProps {
  resumeId: number | null;
  onClose: () => void;
  canEdit: boolean;
  canDelete: boolean;
  onStatusChange: (id: number, status: PipelineStatus) => Promise<void>;
  onEdit: (detail: ResumeDetail) => void;
  onDelete: (id: number) => void;
  onReparsed: () => void;
}

type Source = "cv" | "recruiter" | null;

// ── Formatting ───────────────────────────────────────────────────────────────

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return domain ? `${local.slice(0, 1)}•••••@${domain}` : "•••••";
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "•••••";
  const national = digits.length > 10 ? digits.slice(-10) : digits;
  const country = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : "";
  return `${country}${national.slice(0, 2)}••• ••${national.slice(-2)}`;
}

function experienceText(n: number | null): string | null {
  if (n == null) return null;
  if (n === 0) return "Fresher";
  if (n < 1) return `${Math.max(1, Math.round(n * 12))} months`;
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
  return `${v} year${n === 1 ? "" : "s"}`;
}

function noticeText(days: number | null): string | null {
  if (days == null) return null;
  return days === 0 ? "Immediate" : `${days} days`;
}

/** "MCA, Galgotias University, 2020" -> "MCA, Galgotias University" */
function withoutYear(text: string): string {
  return text.replace(/[\s,(–-]*(19|20)\d{2}\)?\s*$/, "").trim() || text;
}

const PRESENT = /present|current|till\s*(date|now)|to\s*date|\bnow\b|ongoing/i;

function roleLine(w: { company?: string; duration?: string }, current: boolean): string {
  const start = w.duration?.match(/(19|20)\d{2}/)?.[0];
  const when = w.duration && PRESENT.test(w.duration) && start ? `since ${start}` : w.duration;
  const parts = [w.company, when].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return current ? "Current employer" : "Earlier employer";
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
      {children}
    </h3>
  );
}

function SourceTag({ source }: { source: Source }) {
  if (!source) return null;
  const cv = source === "cv";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium",
        cv ? "text-emerald-600 dark:text-emerald-400" : "text-violet-600 dark:text-violet-300",
      )}
      title={cv ? "Read from the candidate's CV" : "Entered by a recruiter"}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", cv ? "bg-emerald-500" : "bg-violet-500")} />
      {cv ? "From CV" : "Recruiter"}
    </span>
  );
}

function FieldRow({ label, value, source, action }: { label: string; value: React.ReactNode; source: Source; action?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 border-t border-gray-100 px-3 py-2.5 first:border-t-0 dark:border-white/10">
      <dt className="truncate text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
        {value == null || value === "" ? <span className="font-normal text-gray-400">—</span> : <span className="truncate">{value}</span>}
        {action}
      </dd>
      <SourceTag source={value == null || value === "" ? null : source} />
    </div>
  );
}

// ── Drawer ───────────────────────────────────────────────────────────────────

export default function ProfileDrawer({
  resumeId,
  onClose,
  canEdit,
  canDelete,
  onStatusChange,
  onEdit,
  onDelete,
  onReparsed,
}: ProfileDrawerProps) {
  const [detail, setDetail] = useState<ResumeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cvOpen, setCvOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (id: number) => {
    setLoading(true);
    try {
      setDetail(await api<ResumeDetail>(`/resume-database/${id}`));
    } catch (err: any) {
      notifyError(err?.message || "Could not load this profile");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [onClose]);

  useEffect(() => {
    setRevealed(false);
    setMenuOpen(false);
    setCvOpen(false);
    setAddOpen(false);
    if (resumeId == null) {
      setDetail(null);
      return;
    }
    load(resumeId);
  }, [resumeId, load]);

  // Escape closes; the page behind does not scroll while the panel is open.
  useEffect(() => {
    if (resumeId == null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [resumeId, onClose]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const closeCv = useCallback(() => setCvOpen(false), []);
  const closeAdd = useCallback(() => setAddOpen(false), []);

  if (resumeId == null) return null;

  const changeStatus = async (status: PipelineStatus) => {
    if (!detail || status === detail.pipeline_status) return;
    setStatusSaving(true);
    try {
      await onStatusChange(detail.id, status);
      setDetail({ ...detail, pipeline_status: status });
    } catch {
      // onStatusChange already told the user
    } finally {
      setStatusSaving(false);
    }
  };

  const reparse = async () => {
    if (!detail) return;
    setMenuOpen(false);
    setReparsing(true);
    try {
      await apiPost(`/resume-database/${detail.id}/reparse`, {});
      notifySuccess("Resume re-parsed");
      await load(detail.id);
      onReparsed();
    } catch (err: any) {
      notifyError(err?.message || "Re-parse failed");
    } finally {
      setReparsing(false);
    }
  };

  const d = detail;
  const email = d && !d.candidate_email.endsWith("@pending.local") ? d.candidate_email : null;
  const typedIn = new Set(d?.recruiter_fields ?? []);
  const src = (field: string): Source => (typedIn.has(field) ? "recruiter" : "cv");
  const work = (d?.work_experience ?? []).filter((w) => w && (w.title || w.company));
  const updated = d ? timeAgo(d.parsed_at || d.created_at) : null;
  const place = d ? d.city || d.location : null;
  const education = d?.education?.[0] ? withoutYear(d.education[0]) : null;
  // annual_package is only ever typed in; current_ctc is read from the CV.
  const currentCtc = d ? lpa(d.annual_package ?? d.current_ctc) : null;
  const revealToggle = (email || d?.phone) && (
    <button
      type="button"
      onClick={() => setRevealed((r) => !r)}
      aria-label={revealed ? "Hide contact details" : "Show contact details"}
      title={revealed ? "Hide" : "Show"}
      className="shrink-0 rounded p-0.5 text-gray-400 hover:text-violet-600"
    >
      {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100000] flex justify-end" role="dialog" aria-modal="true" aria-label="Candidate profile">
      <button type="button" aria-label="Close profile" onClick={onClose} className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]" />
      <div className="relative flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pb-4 pt-5">
          {d ? (
            <>
              <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold", avatarTone(d.candidate_email || d.id))}>
                {initials(d.candidate_name)}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold leading-tight text-gray-900 dark:text-white">
                  {d.candidate_name || "Unnamed candidate"}
                </h2>
                {(d.current_designation || d.current_company) && (
                  <p className="truncate text-sm text-gray-600 dark:text-gray-300">
                    {d.current_designation}
                    {d.current_company && <>{d.current_designation ? " at " : ""}{d.current_company}</>}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {[place, updated && `Updated ${updated}`].filter(Boolean).join(" · ")}
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1" />
          )}
          {d && canEdit && (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="More actions"
                aria-expanded={menuOpen}
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
              >
                {reparsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-10 z-10 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-gray-800">
                  <button type="button" onClick={() => { setMenuOpen(false); onEdit(d); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5">
                    <Pencil className="h-4 w-4" /> Edit details
                  </button>
                  <button type="button" onClick={reparse} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5">
                    <RefreshCw className="h-4 w-4" /> Re-parse CV
                  </button>
                  {canDelete && (
                    <button type="button" onClick={() => { setMenuOpen(false); onDelete(d.id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10">
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && !d ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin text-violet-500" /> Loading profile…
          </div>
        ) : d ? (
          <>
            <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-6">
              {/* Pipeline status */}
              <div className="flex flex-wrap items-center gap-2">
                {canEdit ? (
                  <select
                    value={d.pipeline_status}
                    disabled={statusSaving}
                    onChange={(e) => changeStatus(e.target.value as PipelineStatus)}
                    aria-label="Pipeline status"
                    className={cn(
                      "h-7 cursor-pointer rounded-full border-0 py-0 pl-2.5 pr-7 text-xs font-semibold outline-none ring-1 ring-inset ring-black/5",
                      PIPELINE_TONES[d.pipeline_status] ?? PIPELINE_TONES.new,
                    )}
                  >
                    {(Object.keys(PIPELINE_LABELS) as PipelineStatus[]).map((s) => (
                      <option key={s} value={s}>{PIPELINE_LABELS[s]}</option>
                    ))}
                  </select>
                ) : (
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", PIPELINE_TONES[d.pipeline_status] ?? PIPELINE_TONES.new)}>
                    {PIPELINE_LABELS[d.pipeline_status] ?? d.pipeline_status}
                  </span>
                )}
                {d.parse_quality != null && d.parsing_status !== "failed" && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">CV parsed · {d.parse_quality}%</span>
                )}
              </div>

              {d.parsing_status === "failed" && d.parsing_error && (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                  Parsing failed: {d.parsing_error}
                </p>
              )}

              {d.summary && (
                <section>
                  <Heading>Summary</Heading>
                  <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">{d.summary}</p>
                </section>
              )}

              <section>
                <Heading>Extracted fields</Heading>
                <dl className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
                  <FieldRow
                    label="Email"
                    value={email ? (revealed ? email : maskEmail(email)) : null}
                    source="cv"
                    action={email ? revealToggle : undefined}
                  />
                  <FieldRow
                    label="Phone"
                    value={d.phone ? (revealed ? d.phone : maskPhone(d.phone)) : null}
                    source={src("phone")}
                    action={!email && d.phone ? revealToggle : undefined}
                  />
                  <FieldRow label="Current role" value={d.current_designation} source={src("current_designation")} />
                  <FieldRow label="Employer" value={d.current_company} source="cv" />
                  <FieldRow label="Total experience" value={experienceText(d.experience_years)} source={src("experience_years")} />
                  <FieldRow label="Education" value={education} source="cv" />
                  <FieldRow label="Current CTC" value={currentCtc} source={d.annual_package != null ? "recruiter" : "cv"} />
                  <FieldRow label="Expected CTC" value={lpa(d.expected_ctc)} source={src("expected_ctc")} />
                  <FieldRow label="Notice period" value={noticeText(d.notice_period_days)} source={src("notice_period_days")} />
                  {d.open_to_relocate != null && (
                    <FieldRow label="Relocation" value={d.open_to_relocate ? "Open to relocate" : "Not open"} source={src("open_to_relocate")} />
                  )}
                </dl>
              </section>

              {d.skills?.length > 0 && (
                <section>
                  <Heading>Skills</Heading>
                  <div className="flex flex-wrap gap-1.5">
                    {d.skills.map((s) => (
                      <span key={s} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-800 dark:border-white/15 dark:text-gray-200">
                        {s}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {(d.certifications?.length ?? 0) > 0 && (
                <section>
                  <Heading>Certifications</Heading>
                  <div className="flex flex-wrap gap-1.5">
                    {d.certifications!.map((c) => (
                      <span key={c} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-800 dark:border-white/15 dark:text-gray-200">
                        {c}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {work.length > 0 && (
                <section>
                  <Heading>Work history</Heading>
                  <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[4px] before:top-2 before:w-px before:bg-gray-200 dark:before:bg-white/10">
                    {work.map((w, i) => (
                      <li key={i} className="relative pl-5">
                        <span className={cn(
                          "absolute left-0 top-1.5 h-[9px] w-[9px] rounded-full ring-2 ring-white dark:ring-gray-900",
                          i === 0 ? "bg-violet-500" : "bg-violet-300 dark:bg-violet-500/50",
                        )} />
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{w.title || w.company}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {w.title ? roleLine(w, i === 0) : roleLine({ duration: w.duration }, i === 0)}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 border-t border-gray-100 px-5 py-3 dark:border-white/10">
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                disabled={!email}
                title={email ? undefined : "This resume has no email address, so it can't be added to an opening"}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" /> Add to opening
              </button>
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-800 hover:border-violet-300 hover:text-violet-700 dark:border-white/15 dark:text-gray-200"
                >
                  <Mail className="h-4 w-4" /> Email
                </a>
              ) : (
                <span className="inline-flex h-10 cursor-not-allowed items-center gap-1.5 rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-400 dark:border-white/10" title="No email address on this resume">
                  <Mail className="h-4 w-4" /> Email
                </span>
              )}
              <button
                type="button"
                onClick={() => setCvOpen(true)}
                disabled={!d.resume_file_url}
                title={d.resume_file_url ? undefined : "The original file is not available"}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-800 hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:text-gray-200"
              >
                <FileText className="h-4 w-4" /> Open original CV
              </button>
            </div>
          </>
        ) : null}
      </div>

      <CvViewerModal
        open={cvOpen}
        onClose={closeCv}
        fileUrl={d?.resume_file_url ?? null}
        candidateName={d?.candidate_name ?? null}
        rawText={d?.raw_text}
      />
      <AddToOpeningModal
        open={addOpen}
        onClose={closeAdd}
        candidateEmail={email}
        candidateName={d?.candidate_name ?? null}
      />
    </div>
  );
}
