"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Upload, CheckCircle, Loader2, AlertCircle, FolderOpen } from "lucide-react";
import { notifySuccess, notifyError } from "@/lib/notify";
import { api, apiUpload } from "@/lib/api";

interface BulkUploadModalProps {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export default function BulkUploadModal({
  open,
  onClose,
  onDone,
}: BulkUploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    total: number;
    completed: number;
    failed: number;
    status: string;
  } | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

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

  // Poll batch progress
  useEffect(() => {
    if (!batchId) return;

    const interval = setInterval(async () => {
      try {
        const data = await api<{
          total: number;
          completed: number;
          failed: number;
          status: string;
        }>(`/resume-database/batch/${batchId}`);
        setProgress(data);

        if (data.status === "completed") {
          clearInterval(interval);
          notifySuccess(
            `Batch complete! ${data.completed} parsed, ${data.failed} failed out of ${data.total}.`
          );
        }
      } catch {
        // silent
      }
    }, 2000);

    pollRef.current = interval;
    return () => clearInterval(interval);
  }, [batchId]);

  const handleUpload = async () => {
    if (files.length === 0) return;

    // Limit per batch to 200
    if (files.length > 200) {
      notifyError("Maximum 200 files per batch. Please upload in smaller batches.");
      return;
    }

    setUploading(true);
    setProgress(null);
    setBatchId(null);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));

      const data = await apiUpload<{
        batch_id: string;
        queued: number;
        total_files: number;
        message: string;
      }>("/resume-database/upload", formData);

      setBatchId(data.batch_id);
      setProgress({
        total: data.queued,
        completed: 0,
        failed: 0,
        status: "processing",
      });
      setFiles([]);
      notifySuccess(`${data.queued} resume(s) queued for parsing!`);
    } catch (err: any) {
      notifyError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setBatchId(null);
    setProgress(null);
    setFiles([]);
    onDone();
  };

  const isComplete = progress?.status === "completed";
  const processed = progress
    ? progress.completed + progress.failed
    : 0;
  const progressPercent = progress && progress.total > 0
    ? Math.round((processed / progress.total) * 100)
    : 0;

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
          {/* Progress view */}
          {progress ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {isComplete ? "Processing complete!" : "Processing resumes..."}
                  </span>
                  <span className="font-medium text-gray-800">
                    {processed} / {progress.total}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all duration-500 ${
                      isComplete ? "bg-green-500" : "bg-blue-500"
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="flex gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-green-500" />
                    {progress.completed} parsed
                  </span>
                  {progress.failed > 0 && (
                    <span className="flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-red-500" />
                      {progress.failed} failed
                    </span>
                  )}
                  {!isComplete && (
                    <span className="flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                      {progress.total - processed} remaining
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs text-gray-400">
                {isComplete
                  ? "All resumes have been processed. You can close this dialog."
                  : "Resumes are parsed using fast extraction (no AI). Each takes less than 1 second. You can close this dialog — processing continues in the background."}
              </p>

              {isComplete && (
                <Button className="w-full" onClick={handleClose}>
                  Done
                </Button>
              )}
            </div>
          ) : (
            <>
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
                  PDF, DOC, DOCX — up to 200 files per batch
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

              {/* File list */}
              {files.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600 font-medium">
                      {files.length} file(s) selected
                    </p>
                    <button
                      onClick={() => setFiles([])}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Clear all
                    </button>
                  </div>
                  {files.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded px-3 py-1.5"
                    >
                      <span className="text-sm text-gray-700 truncate max-w-[400px]">
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
