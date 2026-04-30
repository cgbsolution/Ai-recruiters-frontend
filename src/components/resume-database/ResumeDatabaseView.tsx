"use client";
import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  Search,
  Database,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  Trash2,
  Sparkles,
  Trash,
  Pencil,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, apiPost, API_BASE } from "@/lib/api";
import { notifySuccess, notifyError } from "@/lib/notify";
import BulkUploadModal from "./BulkUploadModal";
import EditResumeModal from "./EditResumeModal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface ResumeItem {
  id: number;
  candidate_email: string;
  candidate_name: string | null;
  phone: string | null;
  current_designation: string | null;
  experience_years: number | null;
  skills: string[];
  education: string[];
  location: string | null;
  annual_package: number | null;
  parsing_status: string;
  parsed_at: string | null;
  created_at: string | null;
  resume_file_path: string | null;
}

interface ResumeListResponse {
  items: ResumeItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface StatsResponse {
  total: number;
  completed: number;
  pending: number;
  failed: number;
}

// ── StatTile ─────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  icon: Icon,
  iconWrap,
  topBar,
  valueClass,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  iconWrap: string;
  topBar: string;
  valueClass?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-gray-900/40">
      <div className={cn("absolute inset-x-0 top-0 h-1", topBar)} />
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl ring-1", iconWrap)}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      </div>
      <p className={cn("mt-3 text-2xl font-bold tabular-nums text-gray-900 dark:text-white", valueClass)}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

// ── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const cfg = (() => {
    switch (status) {
      case "completed":
        return {
          label: "Parsed",
          dot: "bg-emerald-500",
          chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
        };
      case "processing":
        return {
          label: "Processing",
          dot: "bg-sky-500 animate-pulse",
          chip: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30",
        };
      case "failed":
        return {
          label: "Failed",
          dot: "bg-rose-500",
          chip: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
        };
      default:
        return {
          label: "Pending",
          dot: "bg-gray-400",
          chip: "bg-gray-50 text-gray-600 ring-gray-200 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10",
        };
    }
  })();

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1", cfg.chip)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function ResumeDatabaseView() {
  const [items, setItems] = useState<ResumeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [showClearAll, setShowClearAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [editTarget, setEditTarget] = useState<ResumeItem | null>(null);
  const [reparsingIds, setReparsingIds] = useState<Set<number>>(new Set());
  const [hasWriteAccess, setHasWriteAccess] = useState(true);

  const fetchResumes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        status: "all",
      });
      if (search) params.set("search", search);

      const data = await api<ResumeListResponse>(`/resume-database/?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (err: any) {
      notifyError(err.message || "Failed to load resumes");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api<StatsResponse>("/resume-database/stats");
      setStats(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { fetchResumes(); }, [fetchResumes]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    api<{ allowed: boolean }>("/resume-database/permissions")
      .then((res) => setHasWriteAccess(res.allowed))
      .catch(() => setHasWriteAccess(true));
  }, []);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  const handleDelete = async (id: number) => {
    try {
      await api(`/resume-database/${id}`, { method: "DELETE" });
      notifySuccess("Resume deleted");
      setDeleteTarget(null);
      fetchResumes();
      fetchStats();
    } catch (err: any) {
      notifyError(err.message || "Failed to delete");
    }
  };

  const handleUploadDone = () => {
    setShowUpload(false);
    fetchResumes();
    fetchStats();
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      const result = await api<{ deleted: number; message: string }>(
        "/resume-database/clear-all",
        { method: "DELETE" },
      );
      notifySuccess(result.message);
      setShowClearAll(false);
      fetchResumes();
      fetchStats();
    } catch (err: any) {
      notifyError(err.message || "Failed to clear database");
    } finally {
      setClearing(false);
    }
  };

  const handleReparse = async (id: number) => {
    setReparsingIds((prev) => new Set([...prev, id]));
    try {
      const updated = await apiPost<ResumeItem>(`/resume-database/${id}/reparse`, {});
      setItems((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      notifySuccess("Resume re-parsed successfully");
    } catch (err: any) {
      notifyError(err.message || "Re-parse failed");
    } finally {
      setReparsingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleCleanup = async () => {
    try {
      const result = await apiPost<{ deleted: number; message: string }>(
        "/resume-database/cleanup",
        {},
      );
      if (result.deleted > 0) {
        notifySuccess(result.message);
        fetchResumes();
        fetchStats();
      } else {
        notifySuccess("No stale records found — database is clean.");
      }
    } catch (err: any) {
      notifyError(err.message || "Cleanup failed");
    }
  };

  const guardWriteAccess = (action: () => void) => () => {
    if (!hasWriteAccess) {
      notifyError("You do not have permission to perform this action. Please contact your admin.");
      return;
    }
    action();
  };

  return (
    <div className="space-y-5">
      {/* ── Hero banner ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-5 sm:p-6 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-gray-900 dark:to-purple-500/10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-purple-200/40 blur-3xl dark:bg-purple-500/10" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900 dark:ring-white/10">
              <Database className="h-5 w-5 text-indigo-500" />
            </div>
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-600 shadow-sm ring-1 ring-indigo-100 dark:bg-gray-900/80 dark:text-indigo-300 dark:ring-indigo-500/20">
                <Sparkles className="h-3 w-3" /> Talent Pool
              </span>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-gray-900 sm:text-2xl dark:text-white">
                Resume Database
              </h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Central repository of all candidate resumes. Upload in bulk and search by skills, experience, and location.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {stats && stats.failed > 0 && hasWriteAccess && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCleanup}
                className="gap-1.5 rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"
              >
                <Sparkles className="h-4 w-4" />
                Clean Up ({stats.failed})
              </Button>
            )}
            {stats && stats.total > 0 && hasWriteAccess && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowClearAll(true)}
                className="gap-1.5 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
              >
                <Trash className="h-4 w-4" />
                Clear All
              </Button>
            )}
            <Button
              size="sm"
              onClick={guardWriteAccess(() => setShowUpload(true))}
              className={cn(
                "group relative h-9 gap-1.5 overflow-hidden rounded-xl text-sm font-semibold text-white shadow-sm transition-all",
                hasWriteAccess
                  ? "bg-gradient-to-r from-indigo-500 to-purple-500 hover:-translate-y-0.5 hover:from-indigo-600 hover:to-purple-600 hover:shadow-lg hover:shadow-indigo-500/25"
                  : "bg-gray-400",
              )}
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <Upload className="h-4 w-4" />
              Upload Resumes
            </Button>
          </div>
        </div>
      </div>

      {/* ── Stat tiles ──────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Total Resumes"
            value={stats.total}
            icon={Database}
            iconWrap="bg-indigo-50 text-indigo-500 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20"
            topBar="bg-gradient-to-r from-indigo-400 to-indigo-500"
          />
          <StatTile
            label="Parsed"
            value={stats.completed}
            icon={CheckCircle2}
            iconWrap="bg-emerald-50 text-emerald-500 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20"
            topBar="bg-gradient-to-r from-emerald-400 to-green-500"
            valueClass="text-emerald-600 dark:text-emerald-300"
          />
          <StatTile
            label="Processing"
            value={stats.pending}
            icon={Clock}
            iconWrap="bg-sky-50 text-sky-500 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20"
            topBar="bg-gradient-to-r from-sky-400 to-cyan-500"
            valueClass="text-sky-600 dark:text-sky-300"
          />
          <StatTile
            label="Failed"
            value={stats.failed}
            icon={AlertTriangle}
            iconWrap="bg-rose-50 text-rose-500 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/20"
            topBar="bg-gradient-to-r from-rose-400 to-red-500"
            valueClass="text-rose-600 dark:text-rose-300"
          />
        </div>
      )}

      {/* ── Toolbar: search + results info ─────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-gray-900/40">
        <div className="flex flex-1 items-center gap-2">
          <SearchInput
            size="sm"
            shortcut="/"
            placeholder="Search by name, email, skills, location…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onSubmit={() => handleSearch()}
            onClear={handleClearSearch}
            wrapperClassName="max-w-xl"
          />
          <Button size="sm" onClick={handleSearch} className="h-9 gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600">
            <Search className="h-3.5 w-3.5" />
            Search
          </Button>
        </div>

        <p className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
          {search ? (
            <>
              <span className="font-semibold text-gray-700 dark:text-gray-200">{total}</span> result
              {total !== 1 ? "s" : ""} for <span className="italic text-indigo-600">&quot;{search}&quot;</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-gray-700 dark:text-gray-200">{total}</span> resume{total !== 1 ? "s" : ""} in database
            </>
          )}
        </p>
      </div>

      {/* ── Table card ───────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-gray-900/40">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            Loading resumes…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:ring-indigo-500/20">
              <Database className="h-6 w-6 text-indigo-500 dark:text-indigo-300" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-800 dark:text-white">
                {search ? "No matches found" : "Your database is empty"}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {search ? "Try a different search term." : "Upload some resumes to get started."}
              </p>
            </div>
            {!search && (
              <Button
                onClick={guardWriteAccess(() => setShowUpload(true))}
                size="sm"
                className="mt-2 gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600"
              >
                <Upload className="h-3.5 w-3.5" /> Upload Resumes
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-gray-100 bg-gradient-to-r from-gray-50/80 to-white hover:bg-gray-50/80 dark:border-white/10 dark:from-white/5 dark:to-transparent">
                  {[
                    "Name",
                    "Email",
                    "Designation",
                    "Experience",
                    "Skills",
                    "Location",
                    "Package",
                    "Status",
                    "Actions",
                  ].map((h) => (
                    <TableHead
                      key={h}
                      className="px-4 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400"
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const isReparsing = reparsingIds.has(item.id);
                  const emailHidden =
                    item.candidate_email.startsWith("noemail_") ||
                    item.candidate_email.endsWith("@pending.local");
                  return (
                    <TableRow
                      key={item.id}
                      className="border-b border-gray-100 transition-colors hover:bg-indigo-50/30 dark:border-white/10 dark:hover:bg-indigo-500/5"
                    >
                      <TableCell className="px-4 py-3.5">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {item.candidate_name || "—"}
                        </p>
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300">
                        {emailHidden ? <span className="text-gray-400">—</span> : item.candidate_email}
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300">
                        {item.current_designation || <span className="text-gray-400">—</span>}
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-sm">
                        {item.experience_years != null ? (
                          <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200 dark:bg-white/5 dark:text-gray-200 dark:ring-white/10">
                            {item.experience_years} yrs
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <div className="flex max-w-[260px] flex-wrap gap-1">
                          {(item.skills || []).slice(0, 4).map((skill) => (
                            <span
                              key={skill}
                              className="inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20"
                            >
                              {skill}
                            </span>
                          ))}
                          {(item.skills || []).length > 4 && (
                            <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-white/5 dark:text-gray-400">
                              +{item.skills.length - 4}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300">
                        {item.location || <span className="text-gray-400">—</span>}
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-sm">
                        {item.annual_package != null ? (
                          <span className="font-semibold text-gray-900 tabular-nums dark:text-white">
                            {item.annual_package}{" "}
                            <span className="text-xs font-normal text-gray-400">LPA</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <StatusChip status={item.parsing_status} />
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setEditTarget(item)}
                            title="Edit"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReparse(item.id)}
                            disabled={isReparsing}
                            title="Re-parse resume"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                          >
                            <RefreshCw className={cn("h-3.5 w-3.5", isReparsing && "animate-spin")} />
                          </button>
                          {item.resume_file_path && (
                            <a
                              href={`${API_BASE.replace(/\/api$/, "")}/${item.resume_file_path.replace(/\\/g, "/")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View Resume"
                              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-300"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item.id)}
                            title="Delete"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="flex flex-col items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 sm:flex-row dark:border-white/10">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Page <span className="font-semibold text-gray-700 dark:text-gray-200">{page}</span> of{" "}
              <span className="font-semibold text-gray-700 dark:text-gray-200">{totalPages}</span>
              <span className="mx-1 text-gray-300">·</span>
              {total.toLocaleString()} total
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 gap-1.5 rounded-xl disabled:opacity-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 gap-1.5 rounded-xl disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <BulkUploadModal open={showUpload} onClose={() => setShowUpload(false)} onDone={handleUploadDone} />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Resume"
        description="This will permanently delete this resume record. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget !== null) handleDelete(deleteTarget);
        }}
      />

      <ConfirmDialog
        open={showClearAll}
        onOpenChange={setShowClearAll}
        title="Delete All Resumes"
        description="This will permanently remove all resume records and files from the database. This action cannot be undone."
        confirmLabel="Delete All"
        variant="danger"
        onConfirm={handleClearAll}
        loading={clearing}
      />

      <EditResumeModal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        resume={editTarget}
        onUpdated={(updated) => {
          setItems((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
        }}
      />
    </div>
  );
}
