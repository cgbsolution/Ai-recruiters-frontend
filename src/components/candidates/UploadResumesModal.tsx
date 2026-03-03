"use client";
import React, { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Upload } from "lucide-react";
import { notifySuccess, notifyError } from "@/lib/notify";

interface UploadResumesModalProps {
  open: boolean;
  onClose: () => void;
  jobId: number;
  onUploaded: (candidates: any[]) => void;
}

export default function UploadResumesModal({
  open,
  onClose,
  jobId,
  onUploaded,
}: UploadResumesModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

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

  const handleUpload = async () => {
    if (files.length === 0) return;
    setError("");
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("job_id", String(jobId));
      files.forEach((f) => formData.append("files", f));

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/candidates/upload-resume`,
        { method: "POST", body: formData }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }
      const data = await res.json();
      onUploaded(data);
      notifySuccess(`${Array.isArray(data) ? data.length : 1} resume(s) uploaded and parsed successfully!`);
      setFiles([]);
      onClose();
    } catch (err: any) {
      notifyError(err.message || "Failed to upload resumes");
      setError(err.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Add Resumes</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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

          {loading && (
            <p className="text-sm text-blue-600 text-center">
              Parsing resumes with AI... This may take a moment.
            </p>
          )}

          <Button
            className="w-full"
            onClick={handleUpload}
            disabled={files.length === 0 || loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Upload className="w-4 h-4 animate-bounce" /> Processing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Upload className="w-4 h-4" /> Upload
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
