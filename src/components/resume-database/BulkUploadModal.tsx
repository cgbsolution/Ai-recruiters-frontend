"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  X,
  Upload,
  CheckCircle,
  Loader2,
  AlertCircle,
  FolderOpen,
  FolderUp,
  FileText,
  Download,
  Sparkles,
  Zap,
} from "lucide-react";
import { notifySuccess, notifyError } from "@/lib/notify";
import { api, ApiError, apiDownload, apiUpload, saveBlob } from "@/lib/api";
import { holdSessionAlive } from "@/lib/sessionActivity";

const BATCH_SIZE = 100;
// Batches on the server at once: one parsing while the next is already
// queued, so the parse workers never sit idle during the next upload.
const MAX_BATCHES_IN_FLIGHT = 2;
const POLL_INTERVAL_MS = 3000;
// One resume is bounded server-side (read + AI timeouts), so a batch whose
// counts have not moved for this long is not going to; stop waiting on it.
const STALL_TIMEOUT_MS = 20 * 60 * 1000;
// A batch the server has never heard of (404) this many polls in a row.
const MAX_MISSING_POLLS = 10;
// 100 resumes can be 100s of MB on a slow uplink; the 2-min default dropped batches.
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const UPLOAD_ATTEMPTS = 3;

type ParseMode = "fast" | "ai";

interface BulkUploadModalProps {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  replaced?: number;
  status: string;
}

interface UploadResponse {
  batch_id: string;
  queued: number;
  total_files: number;
  message: string;
}

interface BatchCounts {
  completed: number;
  failed: number;
  replaced: number;
}

type BatchEnd = "done" | "stalled" | "lost" | "aborted";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Upload one batch, retrying network errors / timeouts / 5xx. A retried batch
 * the server had in fact received is harmless: re-uploaded identical files
 * replace their earlier copy instead of duplicating it.
 */
async function uploadBatch(path: string, batch: File[]): Promise<UploadResponse> {
  for (let attempt = 1; ; attempt++) {
    const formData = new FormData();
    batch.forEach((f) => formData.append("files", f));
    try {
      return await apiUpload<UploadResponse>(path, formData, { timeout: UPLOAD_TIMEOUT_MS });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      const retryable = status === 0 || status === 408 || status === 429 || status >= 500;
      if (!retryable || attempt >= UPLOAD_ATTEMPTS) throw err;
      await sleep(attempt * 10_000);
    }
  }
}

/**
 * Poll a batch until the server reports it completed. Unlike before, this
 * always ends: a batch that stops progressing or that the server no longer
 * knows is given up on (the server keeps working on whatever it has), instead
 * of spinning forever and blocking every batch after it.
 */
async function waitForBatch(
  batchId: string,
  onProgress: (counts: BatchCounts) => void,
  isAborted: () => boolean,
): Promise<{ counts: BatchCounts; end: BatchEnd }> {
  let counts: BatchCounts = { completed: 0, failed: 0, replaced: 0 };
  let lastChange = Date.now();
  let missing = 0;
  for (;;) {
    if (isAborted()) return { counts, end: "aborted" };
    try {
      const bp = await api<BatchProgress>(`/resume-database/batch/${batchId}`);
      missing = 0;
      if (bp.completed !== counts.completed || bp.failed !== counts.failed) lastChange = Date.now();
      counts = { completed: bp.completed, failed: bp.failed, replaced: bp.replaced ?? 0 };
      onProgress(counts);
      if (bp.status === "completed") return { counts, end: "done" };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404 && ++missing >= MAX_MISSING_POLLS) {
        return { counts, end: "lost" };
      }
      // Network blips / timeouts: keep polling; the stall timer still bounds this.
    }
    if (Date.now() - lastChange > STALL_TIMEOUT_MS) return { counts, end: "stalled" };
    await sleep(POLL_INTERVAL_MS);
  }
}

export default function BulkUploadModal({
  open,
  onClose,
  onDone,
}: BulkUploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parseMode, setParseMode] = useState<ParseMode>("ai");

  // Multi-batch tracking
  const [totalBatches, setTotalBatches] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [parsed, setParsed] = useState(0);
  const [failed, setFailed] = useState(0);
  const [replaced, setReplaced] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [showProgress, setShowProgress] = useState(false);

  const abortRef = useRef(false);

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const allowed = Array.from(newFiles).filter((f) =>
      [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].includes(f.type)
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

  // Closing or reloading the tab mid-upload loses every batch not yet sent.
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const handleUpload = async () => {
    if (files.length === 0) return;

    const selected = files;
    abortRef.current = false;
    setUploading(true);
    setShowProgress(true);
    setParsed(0);
    setFailed(0);
    setReplaced(0);
    setIsComplete(false);
    setTotalFiles(selected.length);

    const batches: File[][] = [];
    for (let i = 0; i < selected.length; i += BATCH_SIZE) {
      batches.push(selected.slice(i, i + BATCH_SIZE));
    }

    setTotalBatches(batches.length);
    setCurrentBatch(0);
    setFiles([]);

    // Latest counts per batch; the totals shown are their sum.
    const counts = new Map<number, BatchCounts>();
    const publish = () => {
      let p = 0;
      let f = 0;
      let r = 0;
      counts.forEach((c) => {
        p += c.completed;
        f += c.failed;
        r += c.replaced;
      });
      setParsed(p);
      setFailed(f);
      setReplaced(r);
    };
    const unfinished: number[] = [];
    const inFlight = new Set<Promise<void>>();

    // A long upload is work in progress: it keeps the session from idling out.
    const releaseSession = holdSessionAlive();
    try {
      for (let i = 0; i < batches.length; i++) {
        while (inFlight.size >= MAX_BATCHES_IN_FLIGHT) await Promise.race(inFlight);
        if (abortRef.current) break;
        setCurrentBatch(i + 1);

        let data: UploadResponse;
        try {
          data = await uploadBatch(`/resume-database/upload?parse_mode=${parseMode}`, batches[i]);
        } catch (err: any) {
          notifyError(
            `Batch ${i + 1}/${batches.length} could not be uploaded: ${err?.message || "Upload error"}`
          );
          counts.set(i, { completed: 0, failed: batches[i].length, replaced: 0 });
          publish();
          continue;
        }

        const waiting: Promise<void> = waitForBatch(
          data.batch_id,
          (c) => {
            counts.set(i, c);
            publish();
          },
          () => abortRef.current,
        ).then(({ counts: c, end }) => {
          counts.set(i, c);
          publish();
          if (end === "stalled" || end === "lost") unfinished.push(i + 1);
          inFlight.delete(waiting);
        });
        inFlight.add(waiting);
      }
      await Promise.all(Array.from(inFlight));
    } finally {
      releaseSession();
    }

    setIsComplete(true);
    setUploading(false);

    let totalParsed = 0;
    let totalFailed = 0;
    let totalReplaced = 0;
    counts.forEach((c) => {
      totalParsed += c.completed;
      totalFailed += c.failed;
      totalReplaced += c.replaced;
    });
    notifySuccess(
      `Done! ${totalParsed} parsed${totalReplaced ? ` (${totalReplaced} replaced older copies)` : ""}, ` +
      `${totalFailed} failed out of ${selected.length}.`
    );
    if (unfinished.length) {
      notifyError(
        `Stopped waiting on batch ${unfinished.join(", ")} — the server keeps processing those ` +
        `resumes; check the Resume Database list in a while.`
      );
    }
  };

  const handleClose = () => {
    // A stray click outside the dialog used to abort an hours-long upload.
    if (
      uploading &&
      !window.confirm(
        "Stop the upload? Resumes already sent keep processing, but the remaining files won't be uploaded."
      )
    ) {
      return;
    }
    abortRef.current = true;
    setShowProgress(false);
    setParsed(0);
    setFailed(0);
    setReplaced(0);
    setIsComplete(false);
    setFiles([]);
    setTotalBatches(0);
    setCurrentBatch(0);
    setTotalFiles(0);
    onDone();
  };

  const handleDownloadFailed = async () => {
    // Authenticated endpoint — fetch with the Bearer token instead of window.open.
    try {
      const blob = await apiDownload("/resume-database/failed/download");
      saveBlob(blob, "failed_resumes.csv");
    } catch (err: any) {
      notifyError(err?.message || "Failed to download the failed-resumes report");
    }
  };

  const processed = parsed + failed;
  const progressPercent =
    totalFiles > 0 ? Math.min(100, Math.round((processed / totalFiles) * 100)) : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-500" />
            Bulk Upload Resumes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {showProgress ? (
            <div className="space-y-4">
              {/* Live counts */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <FileText className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                  <p className="text-xl font-bold text-blue-700">{totalFiles}</p>
                  <p className="text-xs text-blue-500">Total Files</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-1" />
                  <p className="text-xl font-bold text-green-700">{parsed}</p>
                  <p className="text-xs text-green-500">Parsed</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <AlertCircle className="w-5 h-5 text-red-500 mx-auto mb-1" />
                  <p className="text-xl font-bold text-red-700">{failed}</p>
                  <p className="text-xs text-red-500">Failed</p>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {isComplete
                      ? "All processing complete!"
                      : `Processing batch ${currentBatch} of ${totalBatches}...`}
                  </span>
                  <span className="font-medium text-gray-800">
                    {processed} / {totalFiles}
                  </span>
                </div>

                {/* Progress bar */}
                <Progress
                  value={progressPercent}
                  className={`h-3 ${isComplete ? "[&>[data-slot=progress-indicator]]:bg-green-500" : "[&>[data-slot=progress-indicator]]:bg-blue-500"}`}
                />

                {replaced > 0 && (
                  <p className="text-xs text-gray-500">
                    {replaced} duplicate{replaced === 1 ? "" : "s"} replaced an older copy (old record and file removed).
                  </p>
                )}

                {!isComplete && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                    <span>{totalFiles - processed} remaining</span>
                    <span className="ml-auto text-blue-600">
                      {parseMode === "ai" ? "AI Parsing" : "Fast Parsing"}
                      {totalBatches > 1 && ` | Batch ${currentBatch}/${totalBatches}`}
                    </span>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-400">
                {isComplete
                  ? "All resumes have been processed. You can close this dialog."
                  : parseMode === "ai"
                    ? "Resumes are parsed using Claude AI for high accuracy — a few seconds each, several at a time. Keep this tab open until it finishes."
                    : "Resumes are parsed using fast regex extraction. Keep this tab open until it finishes."}
              </p>

              {isComplete && (
                <div className="flex gap-2">
                  {failed > 0 && (
                    <Button
                      variant="outline"
                      className="flex-1 gap-2 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={handleDownloadFailed}
                    >
                      <Download className="w-4 h-4" />
                      Download Failed ({failed})
                    </Button>
                  )}
                  <Button className={failed > 0 ? "flex-1" : "w-full"} onClick={handleClose}>
                    Done
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Parsing mode toggle */}
              <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                <Button
                  variant="ghost"
                  onClick={() => setParseMode("ai")}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    parseMode === "ai"
                      ? "bg-white text-violet-700 shadow-sm border border-violet-200"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  AI Parsing
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    parseMode === "ai" ? "bg-violet-100 text-violet-600" : "bg-gray-200 text-gray-500"
                  }`}>
                    99%
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setParseMode("fast")}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    parseMode === "fast"
                      ? "bg-white text-blue-700 shadow-sm border border-blue-200"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  Fast Parsing
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    parseMode === "fast" ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-500"
                  }`}>
                    ~85%
                  </span>
                </Button>
              </div>

              {/* Mode description */}
              <p className="text-xs text-gray-400 -mt-2 px-1">
                {parseMode === "ai"
                  ? "Uses Claude AI for near-perfect name, skills, and experience extraction. A few seconds per resume."
                  : "Uses regex patterns — fast but may misidentify names or miss fields. < 1s per resume."}
              </p>

              {/* Drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-300 bg-gray-50"
                }`}
                onClick={() =>
                  document.getElementById("bulk-resume-file-input")?.click()
                }
              >
                <FolderOpen className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">
                  Drag and drop resume files here
                </p>
                <p className="text-gray-400 text-xs my-1">or</p>
                <span className="text-blue-600 text-sm font-medium underline cursor-pointer">
                  Browse files
                </span>
                <p className="text-xs text-gray-400 mt-3">
                  PDF, DOC, DOCX — no limit (auto-batched in groups of {BATCH_SIZE}). Re-uploading a resume replaces the older copy.
                </p>
                <input
                  id="bulk-resume-file-input"
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </div>

              {/* Upload folder button */}
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() =>
                  document.getElementById("bulk-resume-folder-input")?.click()
                }
              >
                <FolderUp className="w-4 h-4" />
                Select Entire Folder
              </Button>
              <input
                id="bulk-resume-folder-input"
                type="file"
                multiple
                accept=".pdf,.doc,.docx"
                className="hidden"
                // @ts-expect-error webkitdirectory is not typed
                webkitdirectory=""
                onChange={(e) => addFiles(e.target.files)}
              />

              {/* File list */}
              {files.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600 font-medium">
                      {files.length} file(s) selected
                      {files.length > BATCH_SIZE && (
                        <span className="text-xs text-blue-500 ml-2">
                          ({Math.ceil(files.length / BATCH_SIZE)} batches)
                        </span>
                      )}
                    </p>
                    <Button
                      variant="link"
                      onClick={() => setFiles([])}
                      className="text-xs text-red-500 hover:text-red-700 h-auto p-0"
                    >
                      Clear all
                    </Button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {files.slice(0, 50).map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded px-3 py-1.5"
                      >
                        <span className="text-sm text-gray-700 truncate max-w-[400px]">
                          {file.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFile(idx)}
                          className="text-gray-400 hover:text-gray-600 ml-2 h-6 w-6"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    {files.length > 50 && (
                      <p className="text-xs text-gray-400 text-center py-1">
                        ...and {files.length - 50} more files
                      </p>
                    )}
                  </div>
                </div>
              )}

              <Button
                className="w-full gap-2"
                onClick={handleUpload}
                disabled={files.length === 0 || uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" /> Upload{" "}
                    {files.length > 0 ? `${files.length} ` : ""}Resume(s)
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
