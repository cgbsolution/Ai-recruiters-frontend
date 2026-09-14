"use client";
import React, { useCallback, useRef, useState } from "react";
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
import { api, apiDownload, apiUpload, saveBlob } from "@/lib/api";

const BATCH_SIZE = 100;

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
  status: string;
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

  const handleUpload = async () => {
    if (files.length === 0) return;

    abortRef.current = false;
    setUploading(true);
    setShowProgress(true);
    setParsed(0);
    setFailed(0);
    setIsComplete(false);
    setTotalFiles(files.length);

    const batches: File[][] = [];
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      batches.push(files.slice(i, i + BATCH_SIZE));
    }

    setTotalBatches(batches.length);
    setCurrentBatch(0);
    setFiles([]);

    let totalParsed = 0;
    let totalFailed = 0;

    for (let i = 0; i < batches.length; i++) {
      if (abortRef.current) break;
      setCurrentBatch(i + 1);

      try {
        const formData = new FormData();
        batches[i].forEach((f) => formData.append("files", f));

        const data = await apiUpload<{
          batch_id: string;
          queued: number;
          total_files: number;
          message: string;
        }>(`/resume-database/upload?parse_mode=${parseMode}`, formData);

        // Poll this batch — update live counts every 2s
        await new Promise<void>((resolve) => {
          let resolved = false;
          const check = setInterval(() => {
            if (resolved) return;
            api<BatchProgress>(`/resume-database/batch/${data.batch_id}`)
              .then((bp) => {
                if (resolved) return;

                setParsed(totalParsed + bp.completed);
                setFailed(totalFailed + bp.failed);

                if (bp.status === "completed") {
                  resolved = true;
                  clearInterval(check);
                  totalParsed += bp.completed;
                  totalFailed += bp.failed;
                  setParsed(totalParsed);
                  setFailed(totalFailed);
                  resolve();
                }
              })
              .catch(() => {});
          }, 2000);
        });
      } catch (err: any) {
        notifyError(
          `Batch ${i + 1}/${batches.length} failed: ${err.message || "Upload error"}`
        );
        totalFailed += batches[i].length;
        setFailed(totalFailed);
      }
    }

    setIsComplete(true);
    setUploading(false);
    notifySuccess(
      `Done! ${totalParsed} parsed, ${totalFailed} failed out of ${files.length || totalParsed + totalFailed}.`
    );
  };

  const handleClose = () => {
    abortRef.current = true;
    setShowProgress(false);
    setParsed(0);
    setFailed(0);
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
                    ? "Resumes are parsed using Claude AI for high accuracy. Each takes ~3 seconds."
                    : "Resumes are parsed using fast regex extraction. Each takes less than 1 second."}
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
                  ? "Uses Claude AI for near-perfect name, skills, and experience extraction. ~3s per resume."
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
                  PDF, DOC, DOCX — no limit (auto-batched in groups of {BATCH_SIZE})
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
