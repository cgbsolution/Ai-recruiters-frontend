"use client";
import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Button from "@/components/ui/button/Button";
import { Button as ShadButton } from "@/components/ui/button";
import { CalenderIcon, MailIcon, ChatIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { notifySuccess, notifyError } from "@/lib/notify";

type Candidate = {
  id: number;
  name: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  applied_date: string;
  status: "Applied" | "Interview" | "Offered" | "Selected" | "Hired" | "Rejected";
  image: string;
  job_id: number | null;
  job_title: string | null;
  candidate_stage: string | null;
  interview_status: string | null;
  score: number | null;
};

type JobItem = {
  id: number;
  title: string;
  department: string;
  status: string;
};

const statusColors: Record<string, string> = {
  Applied: "bg-yellow-100 text-yellow-700",
  Interview: "bg-blue-100 text-blue-700",
  Offered: "bg-indigo-100 text-indigo-700",
  Selected: "bg-emerald-100 text-emerald-700",
  Hired: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
};

type FilterTab = "All Candidates" | "Applied" | "Interview" | "Offered" | "Selected" | "Hired" | "Rejected";

const BriefcaseIcon = () => (
  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m8 0H8m8 0h2a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h2" />
  </svg>
);

const CandidateCards = () => {
  const [filter, setFilter] = useState<FilterTab>("All Candidates");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  // Hire flow
  const [hireModalOpen, setHireModalOpen] = useState(false);
  const [hireCandidate, setHireCandidate] = useState<Candidate | null>(null);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [hireLoading, setHireLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);

  useEffect(() => {
    const fetchCandidates = async () => {
      setLoading(true);
      try {
        const path =
          filter === "All Candidates"
            ? "/candidates/"
            : `/candidates/?status=${filter}`;
        const data = await api<Candidate[]>(path);
        setCandidates(data);
      } catch (err) {
        console.error("Error fetching candidates:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCandidates();
  }, [filter]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  const handleStatusChange = useCallback(
    async (candidateId: number, newStatus: string) => {
      try {
        const updated = await api<Candidate>(`/candidates/${candidateId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        setCandidates((prev) =>
          prev.map((c) =>
            c.id === candidateId
              ? {
                  ...c,
                  status: (updated.status || newStatus) as Candidate["status"],
                  candidate_stage: updated.candidate_stage ?? c.candidate_stage,
                  interview_status: updated.interview_status ?? c.interview_status,
                }
              : c
          )
        );
        notifySuccess(`Candidate marked as ${newStatus}`);
      } catch {
        notifyError("Failed to update candidate status");
      }
    },
    []
  );

  // ── Hire Flow ──────────────────────────────────────────────────────────────

  const initiateHire = useCallback(async (candidate: Candidate) => {
    if (candidate.job_id) {
      // Has a job — hire directly
      try {
        const res = await api<{ job_title: string }>(`/candidates/${candidate.id}/hire`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: candidate.job_id }),
        });
        setCandidates((prev) =>
          prev.map((c) =>
            c.id === candidate.id
              ? { ...c, status: "Hired" as const, job_title: res.job_title || c.job_title }
              : c
          )
        );
        notifySuccess(`${candidate.name} hired for ${res.job_title || "the job"}`);
      } catch {
        notifyError("Failed to hire candidate");
      }
      return;
    }

    // No job — check associations
    try {
      const assoc = await api<{ jobs: { job_id: number; job_title: string }[] }>(
        `/candidates/${candidate.id}/job-associations`
      );
      if (assoc.jobs.length > 0) {
        const firstJob = assoc.jobs[0];
        const res = await api<{ job_title: string }>(`/candidates/${candidate.id}/hire`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: firstJob.job_id }),
        });
        setCandidates((prev) =>
          prev.map((c) =>
            c.id === candidate.id
              ? { ...c, status: "Hired" as const, job_title: res.job_title || firstJob.job_title }
              : c
          )
        );
        notifySuccess(`${candidate.name} hired for ${firstJob.job_title}`);
      } else {
        // No job at all — show picker
        setHireCandidate(candidate);
        setSelectedJobId(null);
        setHireModalOpen(true);
        setJobsLoading(true);
        try {
          const jobList = await api<JobItem[]>("/jobs/");
          setJobs(jobList);
        } catch {
          notifyError("Failed to load jobs");
        } finally {
          setJobsLoading(false);
        }
      }
    } catch {
      notifyError("Failed to check job associations");
    }
  }, []);

  const confirmHire = useCallback(async () => {
    if (!hireCandidate || !selectedJobId) return;
    setHireLoading(true);
    try {
      const res = await api<{ job_title: string }>(`/candidates/${hireCandidate.id}/hire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: selectedJobId }),
      });
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === hireCandidate.id
            ? { ...c, status: "Hired" as const, job_id: selectedJobId, job_title: res.job_title }
            : c
        )
      );
      notifySuccess(`${hireCandidate.name} hired for ${res.job_title}`);
      setHireModalOpen(false);
      setHireCandidate(null);
    } catch {
      notifyError("Failed to hire candidate");
    } finally {
      setHireLoading(false);
    }
  }, [hireCandidate, selectedJobId]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const getActionButton = (c: Candidate) => {
    switch (c.status) {
      case "Applied":
        return (
          <Button className="w-full" size="sm" variant="primary" onClick={() => handleStatusChange(c.id, "Interview")}>
            Move to Interview
          </Button>
        );
      case "Interview":
        return (
          <div className="flex gap-2">
            <Button className="flex-1" size="sm" variant="primary" onClick={() => handleStatusChange(c.id, "Offered")}>
              Send Offer
            </Button>
            <Button className="flex-1" size="sm" variant="outline" onClick={() => handleStatusChange(c.id, "Rejected")}>
              Reject
            </Button>
          </div>
        );
      case "Offered":
        return (
          <div className="flex gap-2">
            <Button className="flex-1" size="sm" variant="primary" onClick={() => handleStatusChange(c.id, "Selected")}>
              Select
            </Button>
            <Button className="flex-1" size="sm" variant="outline" onClick={() => handleStatusChange(c.id, "Rejected")}>
              Reject
            </Button>
          </div>
        );
      case "Selected":
        return (
          <Button className="w-full" size="sm" variant="primary" onClick={() => initiateHire(c)}>
            Mark as Hired
          </Button>
        );
      case "Hired":
        return (
          <div className="w-full rounded-md bg-green-50 border border-green-200 py-2.5 px-3 text-center">
            <span className="text-sm font-semibold text-green-700">Hired</span>
            {c.job_title && (
              <span className="block text-xs text-green-600 mt-0.5">for {c.job_title}</span>
            )}
          </div>
        );
      case "Rejected":
        return (
          <div className="w-full rounded-md bg-red-50 border border-red-200 py-2 text-center text-sm font-medium text-red-600">
            Rejected
          </div>
        );
      default:
        return null;
    }
  };

  const tabs: FilterTab[] = ["All Candidates", "Applied", "Interview", "Offered", "Selected", "Hired", "Rejected"];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Candidates</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <ShadButton
            key={tab}
            variant="ghost"
            size="sm"
            className={`whitespace-nowrap rounded-none pb-2 text-sm font-medium ${
              filter === tab
                ? "text-indigo-600 border-b-2 border-indigo-600"
                : "text-gray-500 hover:text-gray-800"
            }`}
            onClick={() => setFilter(tab)}
          >
            {tab}
          </ShadButton>
        ))}
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, idx) => (
            <article key={idx} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div>
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-8 w-full mt-8 rounded" />
            </article>
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">No candidates found</p>
          <p className="text-sm mt-1">
            {filter === "All Candidates"
              ? "No candidates have been added yet."
              : `No candidates with status "${filter}".`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {candidates.map((c) => (
            <div key={c.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3 min-w-0">
                  <Image
                    src={c.image || "/images/user/user-01.jpg"}
                    alt={c.name}
                    width={40}
                    height={40}
                    className="rounded-full shrink-0"
                  />
                  <div className="min-w-0">
                    <h4 className="font-semibold text-gray-800 truncate">{c.name}</h4>
                    {c.role && <p className="text-sm text-gray-500 truncate">{c.role}</p>}
                  </div>
                </div>
                <span className={`shrink-0 ml-2 px-3 py-1 text-xs font-medium rounded-full ${statusColors[c.status] || "bg-gray-100 text-gray-600"}`}>
                  {c.status}
                </span>
              </div>

              {/* Job Badge — always visible if linked */}
              {c.job_title ? (
                <div className="mt-3">
                  <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                    <BriefcaseIcon />
                    {c.job_title}
                  </span>
                </div>
              ) : (
                <div className="mt-3">
                  <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-400">
                    <BriefcaseIcon />
                    No job linked
                  </span>
                </div>
              )}

              {/* Details */}
              <div className="space-y-2 text-sm text-gray-500 pt-3">
                {c.email && !c.email.endsWith("@resume.local") && (
                  <div className="flex items-center gap-2 truncate">
                    <MailIcon />
                    <span className="truncate">{c.email}</span>
                  </div>
                )}
                {c.phone && (
                  <div className="flex items-center gap-2">
                    <ChatIcon />
                    <span>{c.phone}</span>
                  </div>
                )}
                {c.location && (
                  <div className="flex items-center gap-2 truncate">
                    <CalenderIcon />
                    <span className="truncate">{c.location}</span>
                  </div>
                )}
                {c.applied_date && (
                  <div className="flex items-center gap-2">
                    <CalenderIcon />
                    <span>Applied: {formatDate(c.applied_date)}</span>
                  </div>
                )}
                {c.score != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600">Score: {c.score.toFixed(1)}%</span>
                  </div>
                )}
              </div>

              {/* Action */}
              <div className="w-full mt-4">{getActionButton(c)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Hire Job Picker Modal ─────────────────────────────────────────── */}
      <Dialog open={hireModalOpen} onOpenChange={setHireModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Job for Hire</DialogTitle>
          </DialogHeader>

          {hireCandidate && (
            <div className="mb-4 rounded-md bg-gray-50 p-3">
              <p className="font-medium text-gray-800">{hireCandidate.name}</p>
              <p className="text-sm text-gray-500">{hireCandidate.email}</p>
            </div>
          )}

          <p className="text-sm text-gray-600 mb-3">
            This candidate is not linked to any job. Select a job to hire them for:
          </p>

          {jobsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No jobs available</p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {jobs.map((job) => (
                <ShadButton
                  key={job.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedJobId(job.id)}
                  className={`w-full text-left justify-start h-auto rounded-md border p-3 transition-colors ${
                    selectedJobId === job.id
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div>
                    <p className={`text-sm font-medium ${selectedJobId === job.id ? "text-indigo-700" : "text-gray-800"}`}>
                      {job.title}
                    </p>
                    {job.department && <p className="text-xs text-gray-500">{job.department}</p>}
                  </div>
                </ShadButton>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={() => { setHireModalOpen(false); setHireCandidate(null); }}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" disabled={!selectedJobId || hireLoading} onClick={confirmHire}>
              {hireLoading ? "Hiring..." : "Confirm Hire"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CandidateCards;
