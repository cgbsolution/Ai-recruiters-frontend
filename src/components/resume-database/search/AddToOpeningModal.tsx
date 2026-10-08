"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Briefcase, Loader2, Search, X } from "lucide-react";
import { api, apiPost } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";

interface JobItem {
  id: number;
  ref: string;
  title: string;
  department: string;
  location: string;
  status: string;
  candidates: number;
}

interface AddResult {
  added: number;
  skipped: number;
  details: { email: string; status: string; reason?: string }[];
}

interface AddToOpeningModalProps {
  open: boolean;
  onClose: () => void;
  candidateEmail: string | null;
  candidateName: string | null;
  onAdded?: () => void;
}

const CLOSED = new Set(["inactive", "finished"]);

const SKIP_REASONS: Record<string, string> = {
  "already exists": "is already in this opening",
  "candidate limit exceeded": "could not be added: this opening reached its candidate limit",
  "no metadata found": "could not be added: their resume is not in this opening's organization",
};

/** Add a Resume Database profile to a job opening (reuses
 *  POST /jobs/{ref}/add-matched-candidates, which scores the fit too). */
export default function AddToOpeningModal({ open, onClose, candidateEmail, candidateName, onAdded }: AddToOpeningModalProps) {
  const [jobs, setJobs] = useState<JobItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [savingRef, setSavingRef] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setJobs(null);
    api<JobItem[]>("/jobs/")
      .then(setJobs)
      .catch((err) => {
        notifyError(err?.message || "Could not load openings");
        setJobs([]);
      });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (jobs ?? [])
      .filter((j) => !q || `${j.title} ${j.department} ${j.location}`.toLowerCase().includes(q))
      .sort((a, b) => Number(CLOSED.has(a.status.toLowerCase())) - Number(CLOSED.has(b.status.toLowerCase())));
  }, [jobs, query]);

  if (!open) return null;

  const add = async (job: JobItem) => {
    if (!candidateEmail) return;
    setSavingRef(job.ref);
    try {
      const res = await apiPost<AddResult>(`/jobs/${job.ref}/add-matched-candidates`, {
        candidate_emails: [candidateEmail],
      });
      const who = candidateName || "Candidate";
      if (res.added > 0) {
        notifySuccess(`${who} added to ${job.title}`);
        onAdded?.();
        onClose();
      } else {
        const reason = res.details?.[0]?.reason ?? "";
        notifyError(`${who} ${SKIP_REASONS[reason] ?? "could not be added"}`);
      }
    } catch (err: any) {
      notifyError(err?.message || "Could not add to the opening");
    } finally {
      setSavingRef(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100001] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Add to opening">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-gray-950/50 backdrop-blur-sm" />
      <div className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Add to opening</p>
            {candidateName && <p className="text-xs text-gray-500 dark:text-gray-400">{candidateName}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-gray-100 p-3 dark:border-white/10">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search openings"
              className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:border-violet-400 dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {jobs === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin text-violet-500" /> Loading openings…
            </div>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">{jobs.length ? "No opening matches." : "No openings yet."}</p>
          ) : (
            visible.map((job) => {
              const closed = CLOSED.has(job.status.toLowerCase());
              return (
                <button
                  key={job.ref}
                  type="button"
                  disabled={closed || savingRef !== null}
                  onClick={() => add(job)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    closed ? "cursor-not-allowed opacity-50" : "hover:bg-violet-50 dark:hover:bg-violet-500/10",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                    <Briefcase className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{job.title}</span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      {[job.department, job.location, `${job.candidates} candidates`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {savingRef === job.ref ? (
                    <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
                      {job.status}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
