"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Upload, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { notifySuccess, notifyError } from "@/lib/notify";
import { api, apiUpload } from "@/lib/api";

interface UploadResumesModalProps {
  open: boolean;
  onClose: () => void;
  /** The job's opaque ref (the API accepts it wherever a job id is expected). */
  jobId: string;
  onUploaded: (candidates: any[]) => void;
}

type ParseStatus = "uploading" | "pending" | "processing" | "completed" | "failed";

interface CandidateTrack {
  id: number;
  fileName: string;
  name: string;
  email: string;
  parsing_status: ParseStatus;
  resume_fit_score: string | null;
  parsing_error?: string | null;
}

export default function UploadResumesModal({
  open,
  onClose,
  jobId,
  onUploaded,
}: UploadResumesModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // After upload: track parsing status per candidate
  const [candidates, setCandidates] = useState<CandidateTrack[]>([]);
  const [polling, setPolling] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const notifiedRef = useRef<Set<number>>(new Set());

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const allFiles = Array.from(newFiles);
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const allowed: File[] = [];
    const rejected: string[] = [];

    for (const f of allFiles) {
      if (allowedTypes.includes(f.type)) {
        allowed.push(f);
      } else {
        // Get a friendly file type description
        const ext = f.name.split(".").pop()?.toUpperCase() || "Unknown";
        rejected.push(`${f.name} (.${ext})`);
      }
    }

    if (rejected.length > 0) {
      const fileList = rejected.length <= 3
        ? rejected.join(", ")
        : `${rejected.slice(0, 3).join(", ")} and ${rejected.length - 3} more`;
      notifyError(
        `Unsupported file${rejected.length > 1 ? "s" : ""} skipped: ${fileList}. Only PDF, DOC, and DOCX files are accepted.`
      );
    }

    if (allowed.length > 0) {
      setFiles((prev) => [...prev, ...allowed]);
    }
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }, []);

  // Poll parsing status for all uploaded candidates
  const pollStatuses = useCallback(async (ids: number[]) => {
    try {
      const statuses = await Promise.all(
        ids.map((id) =>
          api<any>(`/candidates/${id}/parsing-status`).catch(() => null)
        )
      );

      const updated = statuses.filter(Boolean);

      // Update modal tracking state — mark deleted candidates (404) as failed
      setCandidates((prev) =>
        prev.map((c, idx) => {
          const fresh = updated.find((u: any) => u.candidate_id === c.id);
          if (fresh) {
            return {
              ...c,
              parsing_status: fresh.parsing_status as ParseStatus,
              name: fresh.name || c.name,
              email: fresh.email || c.email,
              resume_fit_score: fresh.resume_fit_score,
            };
          }
          // If status returned null (404) and candidate was processing/pending,
          // it was deleted due to parse failure
          if (
            statuses[idx] === null &&
            c.parsing_status !== "completed" &&
            c.parsing_status !== "failed"
          ) {
            return { ...c, parsing_status: "failed" as ParseStatus };
          }
          return c;
        })
      );

      // Progressively update parent table as each candidate completes (not failed)
      const newlyCompleted = updated.filter(
        (s: any) =>
          s.parsing_status === "completed" &&
          !notifiedRef.current.has(s.candidate_id)
      );
      if (newlyCompleted.length > 0) {
        const newIds = newlyCompleted.map((s: any) => s.candidate_id);
        // Fetch full candidate data for newly completed ones
        const fullCandidates = await Promise.all(
          newIds.map((id: number) => api<any>(`/candidates/${id}`).catch(() => null))
        );
        const valid = fullCandidates.filter(Boolean);
        if (valid.length > 0) {
          onUploaded(valid);
          newIds.forEach((id: number) => notifiedRef.current.add(id));
        }
      }

      // Check if all done (all either completed, failed, or deleted/404)
      const allResolved = ids.every((id) => {
        const fresh = updated.find((u: any) => u.candidate_id === id);
        if (fresh && (fresh.parsing_status === "completed" || fresh.parsing_status === "failed")) return true;
        // 404 = deleted = resolved
        const idx = ids.indexOf(id);
        if (statuses[idx] === null) return true;
        return false;
      });
      return allResolved;
    } catch {
      return false;
    }
  }, [onUploaded]);

  // Polling loop
  useEffect(() => {
    if (!polling || candidates.length === 0) return;

    const ids = candidates.map((c) => c.id);

    // Run first poll immediately
    let stopped = false;

    const notifyDone = () => {
      setPolling(false);
      setAllDone(true);
    };

    const runPoll = async () => {
      const done = await pollStatuses(ids);
      if (done && !stopped) {
        notifyDone();
      }
    };
    runPoll();

    const interval = setInterval(async () => {
      if (stopped) return;
      const done = await pollStatuses(ids);
      if (done) {
        stopped = true;
        clearInterval(interval);
        notifyDone();
      }
    }, 2000);

    pollRef.current = interval;
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [polling, candidates.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async () => {
    if (files.length === 0 || uploading) return;  // guard against double-click
    setError("");
    setUploading(true);
    setCandidates([]);
    setAllDone(false);

    // Show processing state immediately with file names
    const uploadingTracks: CandidateTrack[] = files.map((f, i) => ({
      id: -(i + 1), // temporary negative IDs
      fileName: f.name,
      name: f.name.replace(/\.[^.]+$/, "").replace(/^\d{10,}_/, "").replace(/[_-]/g, " ").trim(),
      email: "",
      parsing_status: "processing" as ParseStatus,
      resume_fit_score: null,
    }));
    setCandidates(uploadingTracks);

    try {
      const formData = new FormData();
      formData.append("job_id", jobId);
      files.forEach((f) => formData.append("files", f));

      const data = await apiUpload<any[]>("/candidates/upload-resume", formData, {
        timeout: 600_000, // 10 min — AI scoring takes ~40s per resume
      });
      const returnedIds = new Set((data || []).map((c: any) => c.id));

      // Map results back to uploaded files
      const candidateTracks: CandidateTrack[] = files.map((f, i) => {
        const matched = data && data[i] ? data[i] : null;
        if (matched && returnedIds.has(matched.id)) {
          return {
            id: matched.id,
            fileName: f.name,
            name: matched.name || f.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "),
            email: matched.email || "",
            parsing_status: (matched.parsing_status || "completed") as ParseStatus,
            resume_fit_score: matched.resume_fit_score,
            parsing_error: matched.parsing_error || null,
          };
        }
        // Backend returned fewer items than uploaded (index mismatch or network error).
        return {
          id: -(i + 1),
          fileName: f.name,
          name: f.name.replace(/\.[^.]+$/, "").replace(/^\d{10,}_/, "").replace(/[_-]/g, " ").trim(),
          email: "",
          parsing_status: "failed" as ParseStatus,
          resume_fit_score: null,
          parsing_error: null,
        };
      });

      candidateTracks.forEach((c) => {
        if (c.parsing_status === "failed") {
          console.error(
            `[ResumeUpload] Failed to parse "${c.fileName}":`,
            c.parsing_error || "Unknown error"
          );
        }
      });

      setCandidates(candidateTracks);
      setFiles([]);
      setAllDone(true);

      // Add successfully parsed candidates to parent table
      const successCandidates = (data || []).filter((c: any) =>
        c.parsing_status === "completed"
      );
      const failCount = files.length - successCandidates.length;
      if (successCandidates.length > 0) {
        onUploaded(successCandidates);
        notifySuccess(
          failCount > 0
            ? `${successCandidates.length} resume(s) added, ${failCount} failed.`
            : `${successCandidates.length} resume(s) added successfully!`
        );
      } else if (failCount > 0) {
        notifyError(`${failCount} resume(s) failed to parse.`);
      }
    } catch (err: any) {
      notifyError(err.message || "Failed to upload resumes");
      setError(err.message || "Upload failed");
      setCandidates([]);
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPolling(false);
    setCandidates([]);
    setFiles([]);
    setError("");
    setAllDone(false);
    notifiedRef.current = new Set();
    onClose();
  };

  const statusIcon = (s: ParseStatus) => {
    switch (s) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "processing":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case "uploading":
        return <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />;
      default:
        return <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />;
    }
  };

  const statusLabel = (s: ParseStatus) => {
    switch (s) {
      case "completed": return "Parsed";
      case "failed": return "Failed";
      case "processing": return "Parsing...";
      case "uploading": return "Uploading...";
      default: return "Queued";
    }
  };

  const statusColor = (s: ParseStatus) => {
    switch (s) {
      case "completed": return "bg-green-100 text-green-700";
      case "failed": return "bg-red-100 text-red-700";
      case "uploading": return "bg-purple-100 text-purple-700";
      default: return "bg-blue-100 text-blue-700";
    }
  };

  // Progress bar calculation
  const successCount = candidates.filter((c) => c.parsing_status === "completed").length;
  const failedCount = candidates.filter((c) => c.parsing_status === "failed").length;
  const completedCount = successCount + failedCount;
  const progressPercent = candidates.length > 0
    ? Math.round((completedCount / candidates.length) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Add Resumes</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Show parsing progress if candidates exist */}
          {candidates.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                {allDone
                  ? failedCount > 0
                    ? `${successCount} resume(s) added, ${failedCount} failed to parse.`
                    : `All ${successCount} resume(s) added successfully!`
                  : "Parsing resumes in background... You can close this dialog."}
              </p>

              {/* Progress bar */}
              {!allDone && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{completedCount} of {candidates.length} processed</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {candidates.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {statusIcon(c.parsing_status)}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">
                          {c.parsing_status === "completed" && c.name
                            ? c.name
                            : c.name || c.fileName}
                        </p>
                        {c.parsing_status === "completed" && c.email &&
                         !c.email.endsWith("@resume.local") && (
                          <p className="text-xs text-gray-500 truncate">{c.email}</p>
                        )}
                        {c.parsing_status === "failed" && (
                          <p className="text-xs text-red-500">
                            Could not parse this file. Please check the format and try again.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColor(c.parsing_status)}`}>
                        {statusLabel(c.parsing_status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {allDone && (
                <Button className="w-full" onClick={handleClose}>
                  Done
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                  dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-gray-50"
                }`}
                onClick={() => document.getElementById("resume-file-input")?.click()}
              >
                <p className="text-gray-500 text-sm">Drag and Drop here</p>
                <p className="text-gray-400 text-xs my-1">or</p>
                <span className="text-blue-600 text-sm font-medium underline cursor-pointer">
                  Browse files
                </span>
                <input
                  id="resume-file-input"
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <p className="text-xs text-gray-400 mt-2">Accepted: PDF, DOC, DOCX only</p>
              </div>

              {/* File list */}
              {files.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded px-3 py-2"
                >
                  <span className="text-sm text-gray-700 truncate max-w-[380px]">
                    {file.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(idx)}
                    className="text-gray-400 hover:text-gray-600 ml-2"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}

              <p className="text-xs text-gray-400">
                Accepted File Types: .pdf, .doc and .docx only
              </p>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded">{error}</p>
              )}

              <Button
                className="w-full"
                onClick={handleUpload}
                disabled={files.length === 0 || uploading}
              >
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Uploading & Parsing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Upload className="w-4 h-4" /> Upload
                  </span>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
