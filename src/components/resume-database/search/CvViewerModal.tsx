"use client";
import React, { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Loader2, X } from "lucide-react";
import { mediaUrl } from "@/lib/api";

interface CvViewerModalProps {
  open: boolean;
  onClose: () => void;
  /** Signed, expiring "/media/..." URL of the original file. */
  fileUrl: string | null;
  candidateName: string | null;
  /** Text the parser read from the file — shown when the browser can't render it (Word files). */
  rawText?: string | null;
}

function fileExtension(url: string | null): string {
  if (!url) return "";
  const path = url.split("?")[0];
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

/** The original CV in a pop-up. PDFs render inline (the /media route serves
 *  them inline and is exempt from X-Frame-Options for exactly this); Word
 *  files can't be shown by a browser, so their parsed text is shown with a
 *  download link. */
export default function CvViewerModal({ open, onClose, fileUrl, candidateName, rawText }: CvViewerModalProps) {
  const [loaded, setLoaded] = useState(false);
  const ext = fileExtension(fileUrl);
  const src = fileUrl ? mediaUrl(fileUrl) : undefined;
  const isPdf = ext === "pdf";

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose, fileUrl]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100001] flex items-center justify-center p-2 sm:p-6" role="dialog" aria-modal="true" aria-label="Original CV">
      <button type="button" aria-label="Close CV" onClick={onClose} className="absolute inset-0 bg-gray-950/60 backdrop-blur-sm" />
      <div className="relative flex h-full max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <FileText className="h-5 w-5 shrink-0 text-violet-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {candidateName ? `${candidateName} — original CV` : "Original CV"}
            </p>
            {ext && <p className="text-xs uppercase text-gray-500 dark:text-gray-400">{ext} file</p>}
          </div>
          {src && (
            // A new tab, never this one: the file is on the API's origin, so the
            // browser ignores `download` here — a PDF would replace the app.
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:border-violet-300 hover:text-violet-700 dark:border-white/15 dark:text-gray-200"
            >
              {isPdf ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              {isPdf ? "New tab" : "Download"}
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative flex-1 bg-gray-100 dark:bg-gray-950">
          {!src ? (
            <div className="flex h-full items-center justify-center p-6 text-sm text-gray-500">
              The original file is not available for this profile.
            </div>
          ) : isPdf ? (
            <>
              {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin text-violet-500" /> Opening CV…
                </div>
              )}
              <iframe
                key={src}
                src={`${src}#view=FitH`}
                title={candidateName ? `${candidateName} CV` : "CV"}
                onLoad={() => setLoaded(true)}
                className="h-full w-full border-0"
              />
            </>
          ) : (
            <div className="h-full overflow-y-auto p-4 sm:p-6">
              <div className="mx-auto max-w-3xl rounded-xl bg-white p-5 shadow-sm dark:bg-gray-900">
                <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  Browsers can&apos;t display {ext ? ext.toUpperCase() : "this"} files, so this is the text read from the
                  CV. Use Download to open the original in Word.
                </p>
                {rawText ? (
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                    {rawText}
                  </pre>
                ) : (
                  <p className="text-sm text-gray-500">No text could be read from this file.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
