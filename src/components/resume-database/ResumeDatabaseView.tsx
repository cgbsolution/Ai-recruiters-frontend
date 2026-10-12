"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  MapPin,
  Search,
  SlidersHorizontal,
  Trash,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/context/AuthContext";
import { api, apiPost } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import BulkUploadModal from "./BulkUploadModal";
import EditResumeModal from "./EditResumeModal";
import FiltersPanel from "./search/FiltersPanel";
import ProfileDrawer, { type ResumeDetail } from "./search/ProfileDrawer";
import ResumeCard from "./search/ResumeCard";
import {
  EDUCATION_LABELS,
  EMPTY_FILTERS,
  FRESHNESS_OPTIONS,
  PAGE_SIZE,
  PIPELINE_LABELS,
  QUALITY_OPTIONS,
  SORT_OPTIONS,
  SOURCE_LABELS,
  filtersFromParams,
  filtersToParams,
  hasActiveFilters,
  type Facets,
  type Filters,
  type PipelineStatus,
  type ResumeCardData,
  type SearchResponse,
  type SortKey,
} from "./search/types";

interface StatsResponse {
  total: number;
  completed: number;
  pending: number;
  failed: number;
}

interface Chip {
  id: string;
  label: string;
  remove: Partial<Filters>;
}

const FETCH_DEBOUNCE_MS = 250;

function CardSkeleton() {
  return (
    <div className="flex animate-pulse gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-gray-900/40">
      <div className="h-12 w-12 rounded-full bg-gray-100 dark:bg-white/10" />
      <div className="flex-1 space-y-3">
        <div className="h-4 w-1/3 rounded bg-gray-100 dark:bg-white/10" />
        <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-white/10" />
        <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-white/10" />
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-6 w-16 rounded-lg bg-gray-100 dark:bg-white/10" />
          ))}
        </div>
      </div>
    </div>
  );
}

function pageWindow(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, page - 1, page, page + 1]);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

export default function ResumeDatabaseView() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin", "super_admin");

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [ready, setReady] = useState(false);
  const [qInput, setQInput] = useState("");
  const [locInput, setLocInput] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [hasWriteAccess, setHasWriteAccess] = useState(true);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<ResumeDetail | null>(null);
  const [deleteIds, setDeleteIds] = useState<number[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showClearAll, setShowClearAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);

  const requestSeq = useRef(0);
  const lastFacetKey = useRef<string | null>(null);
  const lastRefreshKey = useRef(0);

  // ── Initial state from the URL ─────────────────────────────────────────────
  useEffect(() => {
    const f = filtersFromParams(new URLSearchParams(window.location.search));
    setFilters(f);
    setQInput(f.q);
    setLocInput(f.location);
    setReady(true);
  }, []);

  const fetchStats = useCallback(() => {
    api<StatsResponse>("/resume-database/stats").then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    fetchStats();
    api<{ allowed: boolean }>("/resume-database/permissions")
      .then((res) => setHasWriteAccess(res.allowed))
      .catch(() => setHasWriteAccess(true));
  }, [fetchStats]);

  // ── Search (debounced; the newest request wins) ───────────────────────────
  useEffect(() => {
    if (!ready) return;
    const silent = refreshKey !== lastRefreshKey.current;
    lastRefreshKey.current = refreshKey;
    const timer = setTimeout(async () => {
      const seq = ++requestSeq.current;
      const params = filtersToParams(filters, true);
      const urlParams = filtersToParams(filters, false).toString();
      window.history.replaceState(null, "", urlParams ? `?${urlParams}` : window.location.pathname);

      // Turning a page does not change the counts: skip the facet queries.
      const facetKey = filtersToParams({ ...filters, page: 1, sort: "relevance" }, false).toString();
      const needFacets = silent || facetKey !== lastFacetKey.current || !facets;
      if (!needFacets) params.set("facets", "false");
      if (!silent) setLoading(true);
      try {
        const res = await api<SearchResponse>(`/resume-database/search?${params.toString()}`);
        if (seq !== requestSeq.current) return;
        setData(res);
        if (res.facets) {
          setFacets(res.facets);
          lastFacetKey.current = facetKey;
        }
        if (res.page > res.total_pages && res.total > 0) {
          setFilters((f) => ({ ...f, page: res.total_pages }));
        }
      } catch (err: any) {
        if (seq === requestSeq.current) notifyError(err?.message || "Failed to load resumes");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, silent ? 0 : FETCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // facets is read only to know whether we have any yet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, ready, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const update = useCallback((patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setSelected(new Set());
  }, []);

  const runSearch = () => update({ q: qInput, location: locInput, page: 1 });

  const clearAll = () => {
    setQInput("");
    setLocInput("");
    update({ ...EMPTY_FILTERS, sort: filters.sort });
  };

  // ── Active filter chips ────────────────────────────────────────────────────
  const chips = useMemo<Chip[]>(() => {
    const out: Chip[] = [];
    const label = (key: keyof Facets, value: string) =>
      (facets?.[key] as { key: string; label: string }[] | undefined)?.find((o) => o.key === value)?.label ?? value;
    if (filters.q.trim()) out.push({ id: "q", label: `Keywords: ${filters.q.trim()}`, remove: { q: "" } });
    if (filters.location.trim()) out.push({ id: "loc", label: `Location: ${filters.location.trim()}`, remove: { location: "" } });
    if (filters.expMin !== "" || filters.expMax !== "") {
      const text = filters.expMax === "" ? `${filters.expMin}+ yrs` : `${filters.expMin || 0}–${filters.expMax} yrs`;
      out.push({ id: "exp", label: text, remove: { expMin: "", expMax: "" } });
    }
    const listChips = (key: "ctc" | "notice" | "city" | "skills" | "certs" | "education" | "pipeline" | "source",
                       text: (v: string) => string) =>
      filters[key].forEach((v) =>
        out.push({ id: `${key}:${v}`, label: text(v), remove: { [key]: filters[key].filter((x) => x !== v) } as Partial<Filters> }),
      );
    listChips("skills", (v) => v);
    listChips("city", (v) => v);
    listChips("ctc", (v) => label("ctc", v));
    listChips("notice", (v) => `Notice: ${label("notice", v)}`);
    listChips("certs", (v) => v);
    listChips("education", (v) => EDUCATION_LABELS[v] ?? v);
    listChips("pipeline", (v) => PIPELINE_LABELS[v as PipelineStatus] ?? v);
    listChips("source", (v) => SOURCE_LABELS[v] ?? v);
    if (filters.relocate) out.push({ id: "relocate", label: "Open to relocate", remove: { relocate: false } });
    if (filters.freshness)
      out.push({ id: "fresh", label: FRESHNESS_OPTIONS.find((o) => o.value === filters.freshness)?.label ?? "", remove: { freshness: "" } });
    if (filters.quality)
      out.push({ id: "quality", label: QUALITY_OPTIONS.find((o) => o.value === filters.quality)?.label ?? "", remove: { quality: "" } });
    return out;
  }, [filters, facets]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const setItemStatus = (id: number, status: PipelineStatus) =>
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === id ? { ...i, pipeline_status: status } : i)) });

  const changeStatus = async (id: number, status: PipelineStatus) => {
    const before = data?.items.find((i) => i.id === id)?.pipeline_status;
    setItemStatus(id, status);
    setBusyIds((s) => new Set(s).add(id));
    try {
      await api(`/resume-database/${id}/pipeline-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      refresh();
    } catch (err: any) {
      if (before) setItemStatus(id, before);
      notifyError(err?.message || "Could not update the status");
      throw err;
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  };

  const toggleShortlist = (item: ResumeCardData) =>
    changeStatus(item.id, item.pipeline_status === "shortlisted" ? "new" : "shortlisted").catch(() => {});

  const bulkStatus = async (status: PipelineStatus) => {
    if (!selected.size) return;
    setBulkBusy(true);
    try {
      const res = await apiPost<{ updated: number }>("/resume-database/bulk/pipeline-status", {
        ids: [...selected],
        status,
      });
      notifySuccess(`${res.updated} profile${res.updated === 1 ? "" : "s"} moved to ${PIPELINE_LABELS[status]}`);
      setSelected(new Set());
      refresh();
    } catch (err: any) {
      notifyError(err?.message || "Could not update the selected profiles");
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteIds?.length) return;
    setDeleting(true);
    try {
      if (deleteIds.length === 1) {
        await api(`/resume-database/${deleteIds[0]}`, { method: "DELETE" });
      } else {
        await apiPost("/resume-database/bulk/delete", { ids: deleteIds });
      }
      notifySuccess(deleteIds.length === 1 ? "Resume deleted" : `${deleteIds.length} resumes deleted`);
      setSelected(new Set());
      setDeleteIds(null);
      refresh();
      fetchStats();
    } catch (err: any) {
      notifyError(err?.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      const result = await api<{ deleted: number; message: string }>("/resume-database/clear-all", { method: "DELETE" });
      notifySuccess(result.message);
      setShowClearAll(false);
      refresh();
      fetchStats();
    } catch (err: any) {
      notifyError(err.message || "Failed to clear database");
    } finally {
      setClearing(false);
    }
  };

  // Read failed resumes again (e.g. legacy Word .doc files, which the server
  // could not read before). Progress is followed like a bulk-upload batch.
  const [retrying, setRetrying] = useState(false);
  const handleRetryFailed = async () => {
    setRetrying(true);
    try {
      const res = await apiPost<{ batch_id: string | null; queued: number; missing_files: number }>(
        "/resume-database/retry-failed",
        {},
      );
      if (!res.batch_id || !res.queued) {
        notifySuccess(res.missing_files ? `Nothing to retry — ${res.missing_files} failed file(s) are no longer stored.` : "Nothing to retry.");
        return;
      }
      notifySuccess(`Reading ${res.queued.toLocaleString()} failed resume(s) again…`);
      fetchStats();
      const started = Date.now();
      for (;;) {
        await new Promise((r) => setTimeout(r, 3000));
        let bp: { completed: number; failed: number; status: string } | null = null;
        try {
          bp = await api(`/resume-database/batch/${res.batch_id}`);
        } catch {
          // keep polling through a blip
        }
        if (bp?.status === "completed" || Date.now() - started > 30 * 60 * 1000) {
          if (bp) notifySuccess(`Retry done: ${bp.completed.toLocaleString()} now parsed, ${bp.failed.toLocaleString()} still failed.`);
          break;
        }
        fetchStats();
      }
      refresh();
      fetchStats();
    } catch (err: any) {
      notifyError(err?.message || "Retry failed");
    } finally {
      setRetrying(false);
    }
  };

  const handleCleanup = async () => {
    try {
      const result = await apiPost<{ deleted: number; message: string }>("/resume-database/cleanup", {});
      notifySuccess(result.deleted > 0 ? result.message : "No stale records found — database is clean.");
      if (result.deleted > 0) {
        refresh();
        fetchStats();
      }
    } catch (err: any) {
      notifyError(err.message || "Cleanup failed");
    }
  };

  const guardWrite = (action: () => void) => () => {
    if (!hasWriteAccess) {
      notifyError("You do not have permission to perform this action. Please contact your admin.");
      return;
    }
    action();
  };

  const closeProfile = useCallback(() => setProfileId(null), []);

  // ── Derived view state ─────────────────────────────────────────────────────
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const from = total ? (filters.page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, filters.page * PAGE_SIZE);
  const filtered = hasActiveFilters(filters);
  const allOnPageSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const databaseEmpty = !loading && !filtered && total === 0;

  const filtersPanel = (
    <FiltersPanel
      filters={filters}
      facets={facets}
      onChange={update}
      onClearAll={clearAll}
      activeCount={chips.length}
    />
  );

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20">
            <Database className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Resume Database</h1>
            {stats && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {stats.total.toLocaleString()} resumes
                {stats.pending > 0 && <> · {stats.pending.toLocaleString()} processing</>}
                {stats.failed > 0 && (
                  <>
                    {" · "}
                    {hasWriteAccess ? (
                      <>
                        <span className="font-medium text-amber-700 dark:text-amber-300">{stats.failed.toLocaleString()} failed</span>
                        {" — "}
                        <button
                          type="button"
                          onClick={handleRetryFailed}
                          disabled={retrying}
                          className="font-medium text-violet-700 hover:underline disabled:opacity-60 dark:text-violet-300"
                          title="Read the failed resumes again with the latest file readers"
                        >
                          {retrying ? "retrying…" : "retry"}
                        </button>
                        {" · "}
                        <button type="button" onClick={handleCleanup} disabled={retrying} className="font-medium text-amber-700 hover:underline disabled:opacity-60 dark:text-amber-300" title="Remove failed placeholder records">
                          clean up
                        </button>
                      </>
                    ) : (
                      <>{stats.failed.toLocaleString()} failed</>
                    )}
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stats && stats.total > 0 && hasWriteAccess && (
            <button
              type="button"
              onClick={() => setShowClearAll(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 px-3 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              <Trash className="h-4 w-4" /> Clear all
            </button>
          )}
          <button
            type="button"
            onClick={guardWrite(() => setShowUpload(true))}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white shadow-sm",
              hasWriteAccess ? "bg-violet-600 hover:bg-violet-700" : "bg-gray-400",
            )}
          >
            <Upload className="h-4 w-4" /> Upload resumes
          </button>
        </div>
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────────── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4 dark:border-white/10 dark:bg-gray-900/40"
      >
        <div className="flex flex-col gap-2 md:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Keywords</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder='Skills, designation, company, name, e.g. OutSystems "tech lead" -intern'
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-9 text-sm outline-none focus:border-violet-400 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
            />
            {qInput && (
              <button
                type="button"
                aria-label="Clear keywords"
                onClick={() => {
                  setQInput("");
                  update({ q: "", page: 1 });
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <label className="relative md:w-72">
            <span className="sr-only">Location</span>
            <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={locInput}
              onChange={(e) => setLocInput(e.target.value)}
              placeholder="Location, e.g. Noida, Pune"
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm outline-none focus:border-violet-400 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
          >
            <Search className="h-4 w-4" /> Search
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Type several words to match all of them. Use quotes for an exact phrase and a minus sign to exclude a word.
        </p>
      </form>

      {databaseEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white py-20 text-center dark:border-white/10 dark:bg-gray-900/40">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-500 ring-1 ring-violet-100 dark:bg-violet-500/15">
            <Database className="h-6 w-6" />
          </span>
          <p className="text-base font-semibold text-gray-800 dark:text-white">Your resume database is empty</p>
          <p className="text-sm text-gray-500">Upload resumes to start searching.</p>
          <button
            type="button"
            onClick={guardWrite(() => setShowUpload(true))}
            className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700"
          >
            <Upload className="h-4 w-4" /> Upload resumes
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
          {/* ── Filters (sidebar on desktop, overlay on mobile) ──────────────── */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl">{filtersPanel}</div>
          </aside>
          {mobileFilters && (
            <div className="fixed inset-0 z-[100000] flex flex-col bg-gray-50 lg:hidden dark:bg-gray-950">
              <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-gray-900">
                <span className="font-semibold text-gray-900 dark:text-white">Filters</span>
                <button type="button" onClick={() => setMobileFilters(false)} aria-label="Close filters" className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">{filtersPanel}</div>
              <div className="border-t border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-gray-900">
                <button type="button" onClick={() => setMobileFilters(false)} className="h-11 w-full rounded-xl bg-violet-600 text-sm font-semibold text-white">
                  Show {total.toLocaleString()} profiles
                </button>
              </div>
            </div>
          )}

          {/* ── Results ───────────────────────────────────────────────────────── */}
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {canEdit && items.length > 0 && (
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={(v) =>
                      setSelected((s) => {
                        const next = new Set(s);
                        items.forEach((i) => (v === true ? next.add(i.id) : next.delete(i.id)));
                        return next;
                      })
                    }
                    aria-label="Select all on this page"
                    className="border-gray-300 data-[state=checked]:border-violet-600 data-[state=checked]:bg-violet-600"
                  />
                )}
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  <span className="text-base font-semibold text-gray-900 dark:text-white">{total.toLocaleString()} profiles</span>
                  {total > 0 && (
                    <span className="text-gray-500 dark:text-gray-400">
                      {" "}· showing {from.toLocaleString()} to {to.toLocaleString()}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMobileFilters(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 lg:hidden dark:border-white/10 dark:bg-gray-900 dark:text-gray-200"
                >
                  <SlidersHorizontal className="h-4 w-4" /> Filters{chips.length ? ` (${chips.length})` : ""}
                </button>
                <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="hidden sm:inline">Sort by</span>
                  <select
                    value={filters.sort}
                    onChange={(e) => update({ sort: e.target.value as SortKey, page: 1 })}
                    className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-800 outline-none focus:border-violet-400 dark:border-white/10 dark:bg-gray-900 dark:text-gray-200"
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {chips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {chips.map((chip) => (
                  <span
                    key={chip.id}
                    className="inline-flex items-center gap-1 rounded-full bg-violet-50 py-1 pl-3 pr-1.5 text-sm font-medium text-violet-700 ring-1 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-500/20"
                  >
                    {chip.label}
                    <button
                      type="button"
                      aria-label={`Remove ${chip.label}`}
                      onClick={() => {
                        if ("q" in chip.remove) setQInput("");
                        if ("location" in chip.remove) setLocInput("");
                        update({ ...chip.remove, page: 1 });
                      }}
                      className="rounded-full p-0.5 hover:bg-violet-100 dark:hover:bg-violet-500/20"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                <button type="button" onClick={clearAll} className="text-sm font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-300">
                  Clear all
                </button>
              </div>
            )}

            {canEdit && selected.size > 0 && (
              <div className="sticky top-20 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/95 px-3 py-2 text-sm shadow-sm backdrop-blur dark:border-violet-500/30 dark:bg-violet-950/80">
                <span className="font-semibold text-violet-800 dark:text-violet-200">{selected.size} selected</span>
                <button type="button" disabled={bulkBusy} onClick={() => bulkStatus("shortlisted")} className="rounded-lg bg-violet-600 px-3 py-1.5 font-medium text-white hover:bg-violet-700 disabled:opacity-60">
                  Shortlist
                </button>
                <select
                  value=""
                  disabled={bulkBusy}
                  onChange={(e) => e.target.value && bulkStatus(e.target.value as PipelineStatus)}
                  aria-label="Move selected to status"
                  className="h-8 rounded-lg border border-violet-200 bg-white px-2 text-sm text-gray-800 dark:border-violet-500/30 dark:bg-gray-900 dark:text-gray-200"
                >
                  <option value="">Move to…</option>
                  {(Object.keys(PIPELINE_LABELS) as PipelineStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {PIPELINE_LABELS[s]}
                    </option>
                  ))}
                </select>
                {hasWriteAccess && (
                  <button type="button" disabled={bulkBusy} onClick={() => setDeleteIds([...selected])} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:text-rose-300 dark:hover:bg-rose-500/10">
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                )}
                <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300">
                  Clear selection
                </button>
              </div>
            )}

            {loading && !data ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => <CardSkeleton key={i} />)}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white py-16 text-center dark:border-white/10 dark:bg-gray-900/40">
                <Search className="h-6 w-6 text-gray-300" />
                <p className="text-base font-semibold text-gray-800 dark:text-white">No profiles match</p>
                <p className="text-sm text-gray-500">Try fewer filters or different keywords.</p>
                {filtered && (
                  <button type="button" onClick={clearAll} className="mt-1 text-sm font-semibold text-violet-600 hover:text-violet-700">
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className={cn("space-y-3 transition-opacity", loading && "opacity-60")}>
                {items.map((item) => (
                  <ResumeCard
                    key={item.id}
                    item={item}
                    selected={selected.has(item.id)}
                    onSelect={(checked) =>
                      setSelected((s) => {
                        const next = new Set(s);
                        if (checked) next.add(item.id);
                        else next.delete(item.id);
                        return next;
                      })
                    }
                    onToggleShortlist={() => toggleShortlist(item)}
                    onOpen={() => setProfileId(item.id)}
                    canEdit={canEdit}
                    busy={busyIds.has(item.id)}
                  />
                ))}
              </div>
            )}

            {totalPages > 1 && items.length > 0 && (
              <nav className="flex items-center justify-center gap-1 pt-2" aria-label="Pagination">
                <button
                  type="button"
                  disabled={filters.page <= 1}
                  onClick={() => update({ page: filters.page - 1 })}
                  className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-white/10"
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </button>
                {pageWindow(filters.page, totalPages).map((p, i) =>
                  p === "…" ? (
                    <span key={`gap-${i}`} className="px-1 text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => update({ page: p })}
                      aria-current={p === filters.page ? "page" : undefined}
                      className={cn(
                        "h-9 min-w-9 rounded-lg px-2 text-sm font-medium",
                        p === filters.page
                          ? "bg-violet-600 text-white"
                          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10",
                      )}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  disabled={filters.page >= totalPages}
                  onClick={() => update({ page: filters.page + 1 })}
                  className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-white/10"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            )}
          </div>
        </div>
      )}

      {/* ── Overlays ────────────────────────────────────────────────────────── */}
      <ProfileDrawer
        resumeId={profileId}
        onClose={closeProfile}
        canEdit={canEdit}
        canDelete={canEdit && hasWriteAccess}
        onStatusChange={changeStatus}
        onEdit={(detail) => {
          setProfileId(null);
          setEditTarget(detail);
        }}
        onDelete={(id) => {
          setProfileId(null);
          setDeleteIds([id]);
        }}
        onReparsed={refresh}
      />

      <BulkUploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onDone={() => {
          setShowUpload(false);
          refresh();
          fetchStats();
        }}
      />

      <EditResumeModal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        resume={editTarget}
        onUpdated={() => {
          setEditTarget(null);
          refresh();
        }}
      />

      <ConfirmDialog
        open={deleteIds !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteIds(null);
        }}
        title={deleteIds && deleteIds.length > 1 ? `Delete ${deleteIds.length} resumes` : "Delete resume"}
        description="The selected resume records and their files will be permanently deleted. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={showClearAll}
        onOpenChange={setShowClearAll}
        title="Delete all resumes"
        description="This will permanently remove all resume records and files from the database. This action cannot be undone."
        confirmLabel="Delete all"
        variant="danger"
        onConfirm={handleClearAll}
        loading={clearing}
      />
    </div>
  );
}
