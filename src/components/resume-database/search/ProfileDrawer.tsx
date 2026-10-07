"use client";
import React, { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Download,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { api, apiPost, mediaUrl } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { EDUCATION_LABELS, PIPELINE_LABELS, SOURCE_LABELS, type PipelineStatus } from "./types";
import { PIPELINE_TONES, avatarTone, initials, lpa, noticeLabel, qualityTone, timeAgo, years } from "./format";

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
  parsing_status: string;
  parsing_error: string | null;
  parse_quality: number | null;
  pipeline_status: PipelineStatus;
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

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">
        {value ?? <span className="font-normal text-gray-400">Not stated</span>}
      </dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {children}
    </section>
  );
}

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

  if (resumeId == null) return null;

  const changeStatus = async (status: PipelineStatus) => {
    if (!detail || status === detail.pipeline_status) return;
    setStatusSaving(true);
    try {
      await onStatusChange(detail.id, status);
      setDetail({ ...detail, pipeline_status: status });
    } finally {
      setStatusSaving(false);
    }
  };

  const reparse = async () => {
    if (!detail) return;
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
  const work = (d?.work_experience ?? []).filter((w) => w && (w.title || w.company));
  const updated = d ? timeAgo(d.parsed_at || d.created_at) : null;

  return (
    <div className="fixed inset-0 z-[100000] flex justify-end" role="dialog" aria-modal="true" aria-label="Candidate profile">
      <button type="button" aria-label="Close profile" onClick={onClose} className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]" />
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-start gap-4 border-b border-gray-100 p-5 dark:border-white/10">
          {d ? (
            <>
              <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-base font-semibold", avatarTone(d.candidate_email || d.id))}>
                {initials(d.candidate_name)}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold text-gray-900 dark:text-white">{d.candidate_name || "Unnamed candidate"}</h2>
                {(d.current_designation || d.current_company) && (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {d.current_designation}
                    {d.current_company && <>{d.current_designation ? " at " : ""}{d.current_company}</>}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", PIPELINE_TONES[d.pipeline_status] ?? PIPELINE_TONES.new)}>
                    {PIPELINE_LABELS[d.pipeline_status] ?? d.pipeline_status}
                  </span>
                  {d.parse_quality != null && (
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", qualityTone(d.parse_quality))}>
                      CV parsed · {d.parse_quality}%
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1" />
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
          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  Status
                  <select
                    value={d.pipeline_status}
                    disabled={statusSaving}
                    onChange={(e) => changeStatus(e.target.value as PipelineStatus)}
                    className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-900 outline-none focus:border-violet-400 dark:border-white/10 dark:bg-gray-800 dark:text-gray-100"
                  >
                    {(Object.keys(PIPELINE_LABELS) as PipelineStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {PIPELINE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                {d.resume_file_url && (
                  <a
                    href={mediaUrl(d.resume_file_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-700"
                  >
                    <Download className="h-4 w-4" /> Resume
                  </a>
                )}
                {canEdit && (
                  <>
                    <button type="button" onClick={() => onEdit(d)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-800 hover:border-violet-300 hover:text-violet-700 dark:border-white/15 dark:text-gray-200">
                      <Pencil className="h-4 w-4" /> Edit
                    </button>
                    <button type="button" onClick={reparse} disabled={reparsing} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-800 hover:border-violet-300 hover:text-violet-700 disabled:opacity-50 dark:border-white/15 dark:text-gray-200" title="Re-read the stored resume text with the parser">
                      <RefreshCw className={cn("h-4 w-4", reparsing && "animate-spin")} /> Re-parse
                    </button>
                  </>
                )}
                {canDelete && (
                  <button type="button" onClick={() => onDelete(d.id)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 px-3 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10">
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-700 dark:text-gray-300">
              {email && (
                <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 hover:text-violet-700">
                  <Mail className="h-4 w-4 text-gray-400" /> {email}
                </a>
              )}
              {d.phone && (
                <a href={`tel:${d.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-violet-700">
                  <Phone className="h-4 w-4 text-gray-400" /> {d.phone}
                </a>
              )}
              {d.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-gray-400" /> {d.location}
                </span>
              )}
            </div>

            {d.parsing_status === "failed" && d.parsing_error && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                Parsing failed: {d.parsing_error}
              </p>
            )}

            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Fact label="Experience" value={years(d.experience_years)} />
              <Fact label="Current CTC" value={lpa(d.annual_package ?? d.current_ctc)} />
              <Fact label="Expected CTC" value={lpa(d.expected_ctc)} />
              <Fact label="Notice period" value={noticeLabel(d.notice_period_days)} />
              <Fact label="Relocation" value={d.open_to_relocate == null ? null : d.open_to_relocate ? "Open to relocate" : "Not open"} />
              <Fact label="Highest education" value={d.highest_education ? EDUCATION_LABELS[d.highest_education] : null} />
              <Fact label="Source" value={d.source ? SOURCE_LABELS[d.source] ?? d.source : null} />
              <Fact label="Resume updated" value={updated} />
            </dl>

            {d.summary && (
              <Block title="Summary">
                <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{d.summary}</p>
              </Block>
            )}

            {d.skills?.length > 0 && (
              <Block title={`Skills (${d.skills.length})`}>
                <div className="flex flex-wrap gap-1.5">
                  {d.skills.map((s) => (
                    <span key={s} className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-white/5 dark:text-gray-300">
                      {s}
                    </span>
                  ))}
                </div>
              </Block>
            )}

            {work.length > 0 && (
              <Block title="Work experience">
                <ol className="space-y-4 border-l border-gray-200 pl-4 dark:border-white/10">
                  {work.map((w, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-violet-500 dark:border-gray-900" />
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{w.title || "Role"}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-sm text-gray-600 dark:text-gray-300">
                        {w.company && (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5 text-gray-400" /> {w.company}
                          </span>
                        )}
                        {w.duration && <span className="text-gray-500 dark:text-gray-400">{w.duration}</span>}
                      </p>
                      {w.description && (
                        <p className="mt-1 line-clamp-4 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{w.description}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </Block>
            )}

            {d.education?.length > 0 && (
              <Block title="Education">
                <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
                  {d.education.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </Block>
            )}

            {(d.certifications?.length ?? 0) > 0 && (
              <Block title="Certifications">
                <div className="flex flex-wrap gap-1.5">
                  {d.certifications!.map((c) => (
                    <span key={c} className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      {c}
                    </span>
                  ))}
                </div>
              </Block>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
