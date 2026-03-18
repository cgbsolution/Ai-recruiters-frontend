"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Database, UserPlus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { notifySuccess, notifyError } from "@/lib/notify";
import { api, apiPost } from "@/lib/api";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface ScoreBreakdownItem {
  score: number;
  weight: number;
  contribution: number;
}

type ScoreBreakdown = Record<string, ScoreBreakdownItem>;

interface MatchedCandidate {
  resume_metadata_id: number;
  candidate_email: string;
  candidate_name: string | null;
  current_designation: string | null;
  experience_years: number | null;
  location: string | null;
  skills_match: string[];
  total_skills_matched: number;
  total_skills_required: number;
  fit_score: number;
  fit_level: string;
  score_breakdown: ScoreBreakdown;
  already_added: boolean;
}

interface MatchCandidatesModalProps {
  open: boolean;
  onClose: () => void;
  jobId: number;
  onAdded: () => void;
}

type TaskStatus = "idle" | "running" | "completed" | "failed";

export default function MatchCandidatesModal({
  open,
  onClose,
  jobId,
  onAdded,
}: MatchCandidatesModalProps) {
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState<MatchedCandidate[]>([]);
  const [totalInDb, setTotalInDb] = useState(0);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [threshold, setThreshold] = useState(30);

  // Task / progress state
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("idle");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_SIZE = 50;

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Start the match task
  const startMatching = useCallback(async () => {
    setTaskStatus("running");
    setTaskId(null);
    setCandidates([]);
    setSelectedEmails(new Set());
    setProgressPct(0);
    setProcessed(0);
    setMatchedCount(0);
    setError(null);
    setPage(1);
    stopPolling();

    try {
      const data = await apiPost<{
        task_id: string;
        job_id: number;
        status: string;
      }>(`/jobs/${jobId}/match-candidates?threshold=${threshold}`, {});

      setTaskId(data.task_id);

      // Start polling
      pollRef.current = setInterval(async () => {
        try {
          const status = await api<{
            task_id: string;
            status: string;
            total_in_database: number;
            filtered_count?: number;
            processed: number;
            progress_percent: number;
            matched_count: number;
            eta_seconds?: number;
            candidates?: MatchedCandidate[];
            total_pages?: number;
            page?: number;
            error?: string;
          }>(`/jobs/${jobId}/match-status/${data.task_id}?page=1&page_size=${PAGE_SIZE}`);

          setTotalInDb(status.total_in_database);
          setFilteredCount(status.filtered_count || 0);
          setProcessed(status.processed);
          setEtaSeconds(status.eta_seconds || 0);
          setProgressPct(status.progress_percent);
          setMatchedCount(status.matched_count);

          if (status.status === "completed") {
            stopPolling();
            setTaskStatus("completed");
            setCandidates(status.candidates || []);
            setTotalPages(status.total_pages || 1);
            setPage(1);
          } else if (status.status === "failed") {
            stopPolling();
            setTaskStatus("failed");
            setError(status.error || "Unknown error");
          } else {
            // Show preview while running
            if (status.candidates && status.candidates.length > 0) {
              setCandidates(status.candidates);
            }
          }
        } catch {
          // Ignore poll errors — will retry
        }
      }, 800);
    } catch (err: any) {
      setTaskStatus("failed");
      setError(err.message || "Failed to start matching");
    }
  }, [jobId, threshold, stopPolling]);

  // Load a specific page
  const loadPage = useCallback(async (p: number) => {
    if (!taskId) return;
    try {
      const status = await api<{
        candidates?: MatchedCandidate[];
        total_pages?: number;
        page?: number;
      }>(`/jobs/${jobId}/match-status/${taskId}?page=${p}&page_size=${PAGE_SIZE}`);
      setCandidates(status.candidates || []);
      setTotalPages(status.total_pages || 1);
      setPage(p);
    } catch {
      notifyError("Failed to load page");
    }
  }, [jobId, taskId]);

  // Start when modal opens
  useEffect(() => {
    if (open) {
      startMatching();
    } else {
      stopPolling();
      setTaskStatus("idle");
    }
    return () => stopPolling();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelect = (email: string) => {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  };

  const selectableCount = candidates.filter((c) => !c.already_added).length;

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedEmails(
        new Set(candidates.filter((c) => !c.already_added).map((c) => c.candidate_email))
      );
    } else {
      setSelectedEmails(new Set());
    }
  };

  const allSelected =
    selectableCount > 0 &&
    candidates.filter((c) => !c.already_added).every((c) => selectedEmails.has(c.candidate_email));

  const handleAddSelected = async () => {
    if (selectedEmails.size === 0) return;
    setAdding(true);
    try {
      const result = await apiPost<{ added: number; skipped: number }>(`/jobs/${jobId}/add-matched-candidates`, {
        candidate_emails: Array.from(selectedEmails),
      });
      notifySuccess(`${result.added} candidate(s) added to this job!`);
      onAdded();
      onClose();
    } catch (err: any) {
      notifyError(err.message || "Failed to add candidates");
    } finally {
      setAdding(false);
    }
  };

  const fitScoreColor = (score: number) => {
    if (score >= 75) return "bg-green-100 text-green-700";
    if (score >= 50) return "bg-emerald-100 text-emerald-700";
    if (score >= 40) return "bg-yellow-100 text-yellow-700";
    return "bg-orange-100 text-orange-700";
  };

  const isRunning = taskStatus === "running";
  const isComplete = taskStatus === "completed";
  const isFailed = taskStatus === "failed";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-500" />
            Match Candidates From Database
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* ── Progress Bar (while running) ── */}
          {isRunning && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />

              {/* Progress bar */}
              <div className="w-full max-w-md">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>
                    {filteredCount > 0
                      ? `Scoring ${filteredCount.toLocaleString()} relevant resumes (${totalInDb.toLocaleString()} total)...`
                      : `Scanning ${totalInDb > 0 ? totalInDb.toLocaleString() : ""} resume(s)...`}
                  </span>
                  <span>{progressPct}%</span>
                </div>
                <Progress value={progressPct} className="h-2.5" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>
                    {processed.toLocaleString()} / {(filteredCount || totalInDb).toLocaleString()} processed
                  </span>
                  <span>
                    {matchedCount > 0 && `${matchedCount} match(es) · `}
                    {etaSeconds > 1
                      ? etaSeconds >= 60
                        ? `~${Math.ceil(etaSeconds / 60)} min left`
                        : `~${Math.ceil(etaSeconds)}s left`
                      : progressPct > 0 ? "Almost done..." : "Starting..."}
                  </span>
                </div>
              </div>

              {/* Preview of top matches while scanning */}
              {candidates.length > 0 && (
                <div className="w-full mt-2">
                  <p className="text-xs text-gray-500 mb-1">Top matches so far:</p>
                  <div className="flex flex-wrap gap-2">
                    {candidates.slice(0, 5).map((c) => (
                      <Badge key={c.candidate_email} variant="secondary" className="text-xs">
                        {c.candidate_name || c.candidate_email} — {c.fit_score}%
                      </Badge>
                    ))}
                    {candidates.length > 5 && (
                      <Badge variant="outline" className="text-xs text-gray-400">+{candidates.length - 5} more</Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Error ── */}
          {isFailed && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Database className="w-10 h-10 text-red-300" />
              <p className="text-sm text-red-600">Matching failed: {error}</p>
              <Button variant="outline" size="sm" onClick={startMatching}>
                Retry
              </Button>
            </div>
          )}

          {/* ── No results ── */}
          {isComplete && candidates.length === 0 && matchedCount === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Database className="w-10 h-10 text-gray-300" />
              <p className="text-sm text-gray-500">
                No matching candidates found above {threshold}% threshold.
              </p>
              <p className="text-xs text-gray-400">
                {totalInDb === 0
                  ? "Upload resumes to the Resume Database first."
                  : `Scanned ${totalInDb.toLocaleString()} resume(s). Try lowering the threshold.`}
              </p>
              {totalInDb > 0 && threshold > 15 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setThreshold(Math.max(15, threshold - 15));
                    setTimeout(startMatching, 100);
                  }}
                  className="mt-2"
                >
                  <Search className="w-4 h-4 mr-1" />
                  Try with {Math.max(15, threshold - 15)}% threshold
                </Button>
              )}
            </div>
          )}

          {/* ── Results table ── */}
          {isComplete && candidates.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Found <span className="font-semibold text-blue-600">{matchedCount}</span> match(es)
                  from <span className="font-semibold">{totalInDb.toLocaleString()}</span> resume(s)
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Min score:</span>
                  <Select
                    value={String(threshold)}
                    onValueChange={(v) => {
                      setThreshold(Number(v));
                      setTimeout(startMatching, 100);
                    }}
                  >
                    <SelectTrigger className="w-20 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[15, 20, 25, 30, 40, 50, 60, 75].map((v) => (
                        <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedEmails.size > 0 && (
                    <span className="text-xs text-blue-600 font-medium">
                      {selectedEmails.size} selected
                    </span>
                  )}
                </div>
              </div>

              <div className="overflow-auto flex-1 rounded-lg border border-gray-200">
                <Table>
                  <TableHeader className="bg-gray-50 sticky top-0">
                    <TableRow>
                      <TableHead className="w-10 px-3">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(v) => toggleAll(!!v)}
                          disabled={selectableCount === 0}
                        />
                      </TableHead>
                      <TableHead className="px-3 text-xs font-medium text-gray-600">NAME</TableHead>
                      <TableHead className="px-3 text-xs font-medium text-gray-600">DESIGNATION</TableHead>
                      <TableHead className="px-3 text-xs font-medium text-gray-600">EXP</TableHead>
                      <TableHead className="px-3 text-xs font-medium text-gray-600">MATCHED SKILLS</TableHead>
                      <TableHead className="px-3 text-xs font-medium text-gray-600">FIT SCORE</TableHead>
                      <TableHead className="px-3 text-xs font-medium text-gray-600">STATUS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((c) => (
                      <TableRow
                        key={c.candidate_email}
                        className={c.already_added ? "opacity-50" : ""}
                      >
                        <TableCell className="px-3">
                          <Checkbox
                            checked={selectedEmails.has(c.candidate_email)}
                            onCheckedChange={() => toggleSelect(c.candidate_email)}
                            disabled={c.already_added}
                          />
                        </TableCell>
                        <TableCell className="px-3">
                          <div>
                            <p className="font-medium text-gray-800 text-sm">
                              {c.candidate_name || "Unknown"}
                            </p>
                            <p className="text-xs text-gray-500">{c.candidate_email}</p>
                            {c.location && (
                              <p className="text-xs text-gray-400">{c.location}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-3 text-sm text-gray-600">
                          {c.current_designation || "—"}
                        </TableCell>
                        <TableCell className="px-3 text-sm text-gray-600">
                          {c.experience_years != null ? `${c.experience_years} yrs` : "—"}
                        </TableCell>
                        <TableCell className="px-3">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {c.skills_match.slice(0, 4).map((skill, i) => (
                              <Badge key={`${skill}-${i}`} variant="secondary" className="text-xs px-1.5 py-0.5">
                                {skill}
                              </Badge>
                            ))}
                            {c.skills_match.length > 4 && (
                              <Badge variant="outline" className="text-xs text-gray-400">
                                +{c.skills_match.length - 4}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {c.total_skills_matched}/{c.total_skills_required} skills
                          </p>
                        </TableCell>
                        <TableCell className="px-3">
                          <div className="flex flex-col items-start gap-0.5">
                            <Badge className={`text-xs font-semibold ${fitScoreColor(c.fit_score)}`}>
                              {c.fit_score}%
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] font-medium uppercase border-0 px-0 ${
                              c.fit_level === "high" ? "text-green-600" :
                              c.fit_level === "medium" ? "text-yellow-600" : "text-red-500"
                            }`}>
                              {c.fit_level || "low"} fit
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="px-3">
                          {c.already_added ? (
                            <Badge variant="outline" className="text-xs text-gray-400">Already added</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-green-600 border-green-200">Available</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => loadPage(page - 1)}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-gray-500">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => loadPage(page + 1)}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}

              <div className="flex justify-between items-center pt-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={selectedEmails.size === 0 || adding}
                  onClick={handleAddSelected}
                  className="gap-1"
                >
                  {adding ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  Add {selectedEmails.size > 0 ? `${selectedEmails.size} ` : ""}Selected Candidates
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
