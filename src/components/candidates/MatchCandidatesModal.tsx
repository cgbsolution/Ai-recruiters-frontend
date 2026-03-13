"use client";
import React, { useCallback, useEffect, useState } from "react";
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
import { Loader2, Database, UserPlus, Search } from "lucide-react";
import { notifySuccess, notifyError } from "@/lib/notify";
import { apiPost } from "@/lib/api";

interface ScoreBreakdown {
  skills: number;
  keywords: number;
  title: number;
  experience: number;
}

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
  score_breakdown: ScoreBreakdown;
  already_added: boolean;
}

interface MatchCandidatesModalProps {
  open: boolean;
  onClose: () => void;
  jobId: number;
  onAdded: () => void;
}

export default function MatchCandidatesModal({
  open,
  onClose,
  jobId,
  onAdded,
}: MatchCandidatesModalProps) {
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState<MatchedCandidate[]>([]);
  const [totalInDb, setTotalInDb] = useState(0);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [searched, setSearched] = useState(false);
  const [threshold, setThreshold] = useState(60);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setSearched(false);
    setCandidates([]);
    setSelectedEmails(new Set());
    try {
      const data = await apiPost<{
        job_id: number;
        total_in_database: number;
        matched_count: number;
        candidates: MatchedCandidate[];
      }>(`/jobs/${jobId}/match-candidates?threshold=${threshold}`, {});

      setCandidates(data.candidates || []);
      setTotalInDb(data.total_in_database || 0);
      setSearched(true);
    } catch (err: any) {
      notifyError(err.message || "Failed to match candidates");
    } finally {
      setLoading(false);
    }
  }, [jobId, threshold]);

  useEffect(() => {
    if (open) {
      fetchMatches();
    }
  }, [open, fetchMatches]);

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
    if (score >= 80) return "bg-green-100 text-green-700";
    if (score >= 60) return "bg-emerald-100 text-emerald-700";
    if (score >= 40) return "bg-yellow-100 text-yellow-700";
    return "bg-orange-100 text-orange-700";
  };

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
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-gray-500">
                Scanning resume database for matches...
              </p>
            </div>
          ) : searched && candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Database className="w-10 h-10 text-gray-300" />
              <p className="text-sm text-gray-500">
                No matching candidates found above {threshold}% threshold.
              </p>
              <p className="text-xs text-gray-400">
                {totalInDb === 0
                  ? "Upload resumes to the Resume Database first."
                  : `Scanned ${totalInDb} resume(s). Try lowering the threshold or uploading more resumes.`}
              </p>
              {totalInDb > 0 && threshold > 30 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setThreshold(30);
                  }}
                  className="mt-2"
                >
                  <Search className="w-4 h-4 mr-1" />
                  Try with 30% threshold
                </Button>
              )}
            </div>
          ) : candidates.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Found <span className="font-semibold text-blue-600">{candidates.length}</span> match(es)
                  from <span className="font-semibold">{totalInDb}</span> resume(s)
                  <span className="text-gray-400 ml-1">(threshold: {threshold}%)</span>
                </p>
                <div className="flex items-center gap-2">
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
                              <span
                                key={`${skill}-${i}`}
                                className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded"
                              >
                                {skill}
                              </span>
                            ))}
                            {c.skills_match.length > 4 && (
                              <span className="text-xs text-gray-400">
                                +{c.skills_match.length - 4}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {c.total_skills_matched}/{c.total_skills_required} skills
                          </p>
                        </TableCell>
                        <TableCell className="px-3">
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${fitScoreColor(c.fit_score)}`}>
                            {c.fit_score}%
                          </span>
                        </TableCell>
                        <TableCell className="px-3">
                          {c.already_added ? (
                            <span className="text-xs text-gray-400">Already added</span>
                          ) : (
                            <span className="text-xs text-green-600 font-medium">Available</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

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
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
