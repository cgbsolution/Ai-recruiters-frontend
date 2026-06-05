"use client";
import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { notifySuccess, notifyError } from "@/lib/notify";
import { api, apiDownload, saveBlob } from "@/lib/api";
import { Download, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";

interface RetakeCandidate {
  id: number;
  name: string;
}

interface RetakeInterviewModalProps {
  open: boolean;
  onClose: () => void;
  candidate: RetakeCandidate | null;
  onReset: (candidate: any) => void;
}

/**
 * Two-step "Retake Interview" flow for a completed candidate:
 *   1. Download a ZIP backup of the current interview (video + transcript + evaluation).
 *   2. Only after the recruiter confirms they have the backup, permanently delete
 *      the interview and reset the candidate so they can take it again.
 * The resume and candidate identity are kept — no re-upload needed.
 */
export default function RetakeInterviewModal({
  open,
  onClose,
  candidate,
  onReset,
}: RetakeInterviewModalProps) {
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Reset the step state whenever a different candidate is opened.
  useEffect(() => {
    if (open) {
      setDownloaded(false);
      setDownloading(false);
      setResetting(false);
    }
  }, [open, candidate]);

  if (!candidate) return null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await apiDownload(`/candidates/${candidate.id}/interview-archive`);
      const safe = (candidate.name || "candidate").trim().replace(/\s+/g, "_");
      saveBlob(blob, `interview_${safe}_${candidate.id}.zip`);
      setDownloaded(true);
      notifySuccess("Backup downloaded. Verify the ZIP, then reset.");
    } catch (err: any) {
      notifyError(err?.message || "Failed to download the interview backup.");
    } finally {
      setDownloading(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const updated = await api<any>(`/candidates/${candidate.id}/retake-interview`, {
        method: "POST",
      });
      onReset(updated);
      notifySuccess("Interview reset. The candidate can now retake it using the same link.");
      onClose();
    } catch (err: any) {
      notifyError(err?.message || "Failed to reset the interview.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <RotateCcw className="h-5 w-5 text-indigo-600" />
            Retake Interview — {candidate.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This lets the candidate take the interview again using the{" "}
            <span className="font-medium">same link</span> — their resume and details are kept,
            nothing needs to be re-uploaded.
          </p>

          {/* Step 1 — download backup */}
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                1
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Download a backup first</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  A ZIP with the recording, transcript, and evaluation. The current interview is
                  deleted in step 2, so save this if you might need it.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 gap-1.5"
                  onClick={handleDownload}
                  disabled={downloading || resetting}
                >
                  {downloaded ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {downloading ? "Preparing…" : downloaded ? "Download again" : "Download backup (.zip)"}
                </Button>
              </div>
            </div>
          </div>

          {/* Step 2 — confirm reset */}
          <div className={`rounded-lg border p-3 ${downloaded ? "border-red-200 bg-red-50/40" : "border-gray-200 opacity-60"}`}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-xs font-semibold text-red-700">
                2
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Reset &amp; allow retake</p>
                <p className="mt-0.5 flex items-start gap-1 text-xs text-red-600">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Permanently deletes this interview&apos;s recording, transcript, evaluation, and
                  scores. This cannot be undone.
                </p>
                <Button
                  type="button"
                  className="mt-2 gap-1.5 bg-red-600 hover:bg-red-700"
                  onClick={handleReset}
                  disabled={!downloaded || resetting}
                  title={downloaded ? undefined : "Download the backup first"}
                >
                  <RotateCcw className="h-4 w-4" />
                  {resetting ? "Resetting…" : "I've saved the backup — Reset"}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={resetting}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
