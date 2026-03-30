"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Modal } from "@/components/ui/modal";

const API_STATIC = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const FOLDERS = ["jd", "photos", "recordings", "resumes", "screenshots"] as const;
type Folder = (typeof FOLDERS)[number];

const FOLDER_LABELS: Record<Folder, string> = {
  jd: "Job Descriptions",
  photos: "Photos",
  recordings: "Recordings",
  resumes: "Resumes",
  screenshots: "Screenshots",
};

interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: string;
  is_dir: boolean;
}

interface FolderStat {
  folder: string;
  file_count: number;
  total_size: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getFileType(name: string): "image" | "pdf" | "video" | "audio" | "other" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "webm", "m4a"].includes(ext)) return "audio";
  return "other";
}

const PAGE_SIZE = 60;

export default function FileManagerView() {
  const { hasRole } = useAuth();
  const [activeFolder, setActiveFolder] = useState<Folder>("jd");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<FolderStat[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<FileInfo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "single" | "bulk"; file?: FileInfo } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSuperAdmin = hasRole("super_admin");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Fetch folder stats
  const loadStats = useCallback(async () => {
    try {
      const data = await api<FolderStat[]>("/file-manager/files/stats");
      setStats(data);
    } catch {}
  }, []);

  // Fetch files for the active folder
  const loadFiles = useCallback(async (folder: Folder, pg: number) => {
    setLoading(true);
    try {
      const data = await api<{
        files: FileInfo[];
        total: number;
        page: number;
        has_more: boolean;
      }>(`/file-manager/files/${folder}?page=${pg}&page_size=${PAGE_SIZE}`);
      setFiles(data.files);
      setTotal(data.total);
      setHasMore(data.has_more);
      setPage(pg);
    } catch {
      setFiles([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    setSelected(new Set());
    setPage(1);
    loadFiles(activeFolder, 1);
  }, [activeFolder, loadFiles]);

  // ── Selection ────────────────────────────────────────────────────────────
  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === files.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files.map((f) => f.path)));
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.type === "single" && confirmDelete.file) {
        // Extract the relative part after /uploads/{folder}/
        const relPath = confirmDelete.file.path.replace(`/uploads/${activeFolder}/`, "");
        await api(`/file-manager/files/${activeFolder}/${encodeURIComponent(relPath)}`, {
          method: "DELETE",
        });
        showToast("File deleted");
      } else {
        // Bulk delete — extract filenames from paths
        const filenames = Array.from(selected).map((p) =>
          p.replace(`/uploads/${activeFolder}/`, "")
        );
        await api("/file-manager/files/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder: activeFolder, filenames }),
        });
        showToast(`${filenames.length} files deleted`);
      }
      setSelected(new Set());
      setConfirmDelete(null);
      loadFiles(activeFolder, page);
      loadStats();
    } catch (e: any) {
      showToast(e?.detail || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  // ── Stats for current folder ─────────────────────────────────────────────
  const folderStat = useMemo(
    () => stats.find((s) => s.folder === activeFolder),
    [stats, activeFolder]
  );

  // Only super_admin
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        You do not have permission to access this page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">File Manager</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage backend upload files across all directories
          </p>
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => setConfirmDelete({ type: "bulk" })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <TrashIcon />
            Delete {selected.size} selected
          </button>
        )}
      </div>

      {/* Folder Tabs */}
      <div className="flex flex-wrap gap-2">
        {FOLDERS.map((f) => {
          const stat = stats.find((s) => s.folder === f);
          return (
            <button
              key={f}
              onClick={() => setActiveFolder(f)}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeFolder === f
                  ? "bg-brand-600 text-white shadow-md"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {FOLDER_LABELS[f]}
              {stat && (
                <span className={`ml-2 text-xs ${activeFolder === f ? "text-white/80" : "text-gray-400"}`}>
                  ({stat.file_count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={files.length > 0 && selected.size === files.length}
              onChange={selectAll}
              className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Select All
          </label>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {total} files {folderStat ? `(${formatBytes(folderStat.total_size)})` : ""}
          </span>
        </div>
        {/* Pagination */}
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => loadFiles(activeFolder, page - 1)}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Prev
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <button
            disabled={!hasMore}
            onClick={() => loadFiles(activeFolder, page + 1)}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      {/* File Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-xl h-48 animate-pulse" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <EmptyFolderIcon />
          <p className="mt-3 text-base font-medium">No files in {FOLDER_LABELS[activeFolder]}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {files.map((file) => {
            const isSelected = selected.has(file.path);
            const fileType = getFileType(file.name);

            return (
              <div
                key={file.path}
                className={`group relative bg-white dark:bg-gray-800 rounded-xl border-2 transition-all overflow-hidden hover:shadow-lg ${
                  isSelected
                    ? "border-brand-500 ring-2 ring-brand-200 dark:ring-brand-800"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                {/* Checkbox */}
                <div className="absolute top-2 left-2 z-10">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(file.path)}
                    className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                </div>

                {/* Preview Area */}
                <div
                  className="h-32 flex items-center justify-center bg-gray-50 dark:bg-gray-900/50 cursor-pointer overflow-hidden"
                  onClick={() => setPreviewFile(file)}
                >
                  {fileType === "image" ? (
                    <img
                      src={`${API_STATIC}${file.path}`}
                      alt={file.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : fileType === "pdf" ? (
                    <div className="text-center">
                      <PdfIcon />
                      <p className="text-[10px] text-gray-400 mt-1">PDF</p>
                    </div>
                  ) : fileType === "video" ? (
                    <div className="text-center">
                      <VideoIcon />
                      <p className="text-[10px] text-gray-400 mt-1">Video</p>
                    </div>
                  ) : fileType === "audio" ? (
                    <div className="text-center">
                      <AudioIcon />
                      <p className="text-[10px] text-gray-400 mt-1">Audio</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <GenericFileIcon />
                      <p className="text-[10px] text-gray-400 mt-1">{file.name.split(".").pop()?.toUpperCase()}</p>
                    </div>
                  )}
                </div>

                {/* File Info */}
                <div className="p-2.5">
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate" title={file.name}>
                    {file.name}
                  </p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-gray-400">{formatBytes(file.size)}</span>
                    <span className="text-[10px] text-gray-400">{formatDate(file.modified)}</span>
                  </div>
                </div>

                {/* Hover Actions */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete({ type: "single", file });
                    }}
                    className="p-1.5 rounded-lg bg-red-500/90 text-white hover:bg-red-600 transition-colors"
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <Modal isOpen onClose={() => setPreviewFile(null)} className="max-w-4xl">
          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate pr-4">
                {previewFile.name}
              </h3>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm text-gray-500">{formatBytes(previewFile.size)}</span>
                <button
                  onClick={() => {
                    setConfirmDelete({ type: "single", file: previewFile });
                    setPreviewFile(null);
                  }}
                  className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 transition-colors"
                  title="Delete"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-lg bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
              {getFileType(previewFile.name) === "image" ? (
                <img
                  src={`${API_STATIC}${previewFile.path}`}
                  alt={previewFile.name}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              ) : getFileType(previewFile.name) === "pdf" ? (
                <iframe
                  src={`${API_STATIC}${previewFile.path}`}
                  className="w-full h-[70vh]"
                  title={previewFile.name}
                />
              ) : getFileType(previewFile.name) === "video" ? (
                <video
                  src={`${API_STATIC}${previewFile.path}`}
                  controls
                  className="max-w-full max-h-[70vh]"
                />
              ) : getFileType(previewFile.name) === "audio" ? (
                <div className="p-8">
                  <AudioIcon large />
                  <audio src={`${API_STATIC}${previewFile.path}`} controls className="mt-4 w-full" />
                </div>
              ) : (
                <div className="p-12 text-center text-gray-400">
                  <GenericFileIcon large />
                  <p className="mt-3">No preview available</p>
                  <a
                    href={`${API_STATIC}${previewFile.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-sm text-brand-600 hover:underline"
                  >
                    Download file
                  </a>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-3">{formatDate(previewFile.modified)}</p>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <Modal isOpen onClose={() => !deleting && setConfirmDelete(null)} className="max-w-md">
          <div className="p-6 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <TrashIcon large />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {confirmDelete.type === "single" ? "Delete File?" : `Delete ${selected.size} Files?`}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {confirmDelete.type === "single"
                ? `"${confirmDelete.file?.name}" will be permanently deleted.`
                : `${selected.size} selected files will be permanently deleted.`}
              <br />
              This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-5 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-medium animate-in slide-in-from-bottom-4">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Inline Icons ─────────────────────────────────────────────────────────────

function TrashIcon({ large }: { large?: boolean } = {}) {
  const size = large ? 24 : 16;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function AudioIcon({ large }: { large?: boolean } = {}) {
  const size = large ? 48 : 40;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function GenericFileIcon({ large }: { large?: boolean } = {}) {
  const size = large ? 48 : 40;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function EmptyFolderIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
