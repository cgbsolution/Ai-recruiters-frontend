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
  jobId: number;
  onUploaded: (candidates: any[]) => void;
}

type ParseStatus = "pending" | "processing" | "completed" | "failed";

interface CandidateStatus {
  id: number;
  name: string;
  email: string;
  parsing_status: ParseStatus;
  resume_fit_score: string | null;
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
  const [candidates, setCandidates] = useState<CandidateStatus[]>([]);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const allowed = Array.from(newFiles).filter((f) =>
      ["application/pdf", "application/msword",
       "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(f.type)
    );
    setFiles((prev) => [...prev, ...allowed]);
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
          api<CandidateStatus>(`/candidates/${id}/parsing-status`).catch(() => null)
        )
      );

      const updated = statuses.filter(Boolean) as CandidateStatus[];
      setCandidates((prev) =>
        prev.map((c) => {
          const fresh = updated.find((u) => u.candidate_id === c.id || (u as any).candidate_id === c.id);
          if (fresh) {
            return {
              ...c,
              parsing_status: (fresh as any).parsing_status,
              name: (fresh as any).name || c.name,
              email: (fresh as any).email || c.email,
              resume_fit_score: (fresh as any).resume_fit_score,
            };
          }
          return c;
        })
      );

      // Check if all done
      const allDone = updated.every(
        (s: any) => s.parsing_status === "completed" || s.parsing_status === "failed"
      );
      return allDone;
    } catch {
      return false;
    }
  }, []);

  // Start polling after upload
  useEffect(() => {
    if (!polling || candidates.length === 0) return;

    const ids = candidates.map((c) => c.id);
    const interval = setInterval(async () => {
      const done = await pollStatuses(ids);
      if (done) {
        clearInterval(interval);
        setPolling(false);
        // Fetch full candidate data for the parent
        try {
          const fullCandidates = await Promise.all(
            ids.map((id) => api<any>(`/candidates/${id}`).catch(() => null))
          );
          const valid = fullCandidates.filter(Boolean);
          onUploaded(valid);
          const completed = valid.filter((c: any) => c.parsing_status === "completed").length;
          notifySuccess(`${completed} resume(s) parsed successfully!`);
        } catch {}
      }
    }, 3000);

    pollRef.current = interval;
    return () => clearInterval(interval);
  }, [polling, candidates, pollStatuses, onUploaded]);

  const handleUpload = async () => {
    if (files.length === 0) return;
    setError("");
    setUploading(true);
    setCandidates([]);
    try {
      const formData = new FormData();
      formData.append("job_id", String(jobId));
      files.forEach((f) => formData.append("files", f));

      const data = await apiUpload<any[]>("/candidates/upload-resume", formData);

      // Candidates returned with parsing_status="pending"
      const candidateStatuses: CandidateStatus[] = (data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        parsing_status: c.parsing_status || "pending",
        resume_fit_score: c.resume_fit_score,
      }));

      setCandidates(candidateStatuses);
      setFiles([]);
      setPolling(true);
      // Also immediately inform parent so rows appear in table
      onUploaded(data);
    } catch (err: any) {
      notifyError(err.message || "Failed to upload resumes");
      setError(err.message || "Upload failed");
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
    onClose();
  };

  const allDone = candidates.length > 0 && candidates.every(
    (c) => c.parsing_status === "completed" || c.parsing_status === "failed"
  );

  const statusIcon = (s: ParseStatus) => {
    switch (s) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "processing":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />;
    }
  };

  const statusLabel = (s: ParseStatus) => {
    switch (s) {
      case "completed": return "Parsed";
      case "failed": return "Failed";
      case "processing": return "Parsing...";
      default: return "Queued";
    }
  };

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
                  ? "All resumes processed!"
                  : "Parsing resumes in background... You can close this dialog."}
              </p>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {candidates.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {statusIcon(c.parsing_status)}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">
                          {c.name}
                        </p>
                        {c.parsing_status === "completed" && c.email && (
                          <p className="text-xs text-gray-500 truncate">{c.email}</p>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      c.parsing_status === "completed"
                        ? "bg-green-100 text-green-700"
                        : c.parsing_status === "failed"
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-100 text-blue-700"
                    }`}>
                      {statusLabel(c.parsing_status)}
                    </span>
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
                  <button
                    onClick={() => removeFile(idx)}
                    className="text-gray-400 hover:text-gray-600 ml-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
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
                    <Upload className="w-4 h-4 animate-bounce" /> Uploading...
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
