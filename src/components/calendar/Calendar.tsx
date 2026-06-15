"use client";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  EventClickArg,
  EventContentArg,
  EventInput,
  DayCellContentArg,
} from "@fullcalendar/core";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import {
  buildDaySummaries,
  CalendarInterview,
  formatInterviewMoment,
  STATUS_META,
  STATUS_ORDER,
  statusMeta,
  StatusCategory,
  toUtcIso,
} from "./interviewCalendar";

/** Filter selections; empty string = "All". */
interface Filters {
  position: string;
  status: string;
  interviewer: string;
  department: string;
}

const EMPTY_FILTERS: Filters = {
  position: "",
  status: "",
  interviewer: "",
  department: "",
};

const REFRESH_MS = 30_000;

/** Local YYYY-MM-DD for a Date (matches the cell a UTC instant renders in). */
function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

const Calendar: React.FC = () => {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState<CalendarInterview[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<CalendarInterview | null>(null);
  const lastJsonRef = useRef<string>("");

  // ── Fetch (tenant scoping is enforced server-side) ────────────────────────
  const fetchInterviews = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      const data = await api<CalendarInterview[]>("/calendar/interviews");
      const json = JSON.stringify(data);
      // Skip the state update (and re-render) when a silent poll returns the
      // exact same payload — keeps the calendar from flickering.
      if (json !== lastJsonRef.current) {
        lastJsonRef.current = json;
        setInterviews(data);
      }
    } catch (err) {
      if (!silent) {
        notifyError(
          err instanceof Error ? err.message : "Failed to load interviews",
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInterviews();
  }, [fetchInterviews]);

  // Live updates: poll every 30s, and refresh the moment the tab regains focus
  // so a schedule/reschedule/cancel made elsewhere shows up immediately.
  useEffect(() => {
    const interval = setInterval(() => fetchInterviews({ silent: true }), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchInterviews({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fetchInterviews]);

  // ── Filter option lists (derived from loaded data) ────────────────────────
  const options = useMemo(() => {
    const positions = new Set<string>();
    const interviewers = new Set<string>();
    const departments = new Set<string>();
    for (const iv of interviews) {
      if (iv.job_title) positions.add(iv.job_title);
      if (iv.interviewer) interviewers.add(iv.interviewer);
      if (iv.department) departments.add(iv.department);
    }
    const sort = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b));
    return {
      positions: sort(positions),
      interviewers: sort(interviewers),
      departments: sort(departments),
    };
  }, [interviews]);

  // ── Apply filters ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return interviews.filter((iv) => {
      if (filters.position && iv.job_title !== filters.position) return false;
      if (filters.status && iv.category !== filters.status) return false;
      if (filters.interviewer && iv.interviewer !== filters.interviewer) return false;
      if (filters.department && iv.department !== filters.department) return false;
      return true;
    });
  }, [interviews, filters]);

  const events: EventInput[] = useMemo(
    () =>
      filtered
        .filter((iv) => iv.interview_date)
        .map((iv) => {
          const meta = statusMeta(iv.category);
          return {
            id: String(iv.id),
            title: iv.candidate_name,
            start: toUtcIso(iv.interview_date) ?? undefined,
            backgroundColor: meta.bg,
            borderColor: meta.color,
            extendedProps: { iv },
          } as EventInput;
        }),
    [filtered],
  );

  const summaries = useMemo(() => buildDaySummaries(filtered), [filtered]);

  // Totals per status across the filtered set (header stat strip).
  const totals = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const iv of filtered) counts[iv.category] = (counts[iv.category] ?? 0) + 1;
    return counts;
  }, [filtered]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // ── Renderers ─────────────────────────────────────────────────────────────
  const renderEventContent = (arg: EventContentArg) => {
    const iv = arg.event.extendedProps.iv as CalendarInterview;
    const meta = statusMeta(iv.category);
    return (
      <div
        className="iv-event"
        style={{ borderLeftColor: meta.color, background: meta.bg }}
        title={`${iv.candidate_name} — ${meta.label}${iv.job_title ? ` · ${iv.job_title}` : ""}`}
      >
        <span className="iv-event-dot" style={{ background: meta.color }} />
        {arg.timeText && <span className="iv-event-time">{arg.timeText}</span>}
        <span className="iv-event-title">{iv.candidate_name}</span>
      </div>
    );
  };

  const renderDayCell = (arg: DayCellContentArg) => {
    const s = summaries[localKey(arg.date)];
    return (
      <div className="iv-cell-head">
        <span className="iv-cell-date">{arg.dayNumberText}</span>
        {s && s.total > 0 && (
          <div className="iv-cell-counts">
            <span className="iv-count iv-count-total" title={`${s.total} scheduled`}>
              {s.total}
            </span>
            {s.completed > 0 && (
              <span className="iv-count iv-count-done" title={`${s.completed} completed`}>
                {s.completed}
              </span>
            )}
            {s.pending > 0 && (
              <span className="iv-count iv-count-pending" title={`${s.pending} pending`}>
                {s.pending}
              </span>
            )}
            {s.cancelled > 0 && (
              <span className="iv-count iv-count-cancel" title={`${s.cancelled} cancelled`}>
                {s.cancelled}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const handleEventClick = (arg: EventClickArg) => {
    setSelected(arg.event.extendedProps.iv as CalendarInterview);
  };

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      {/* ── Toolbar: org context, totals, legend, filters ──────────────── */}
      <div className="flex flex-col gap-4 border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Interview Schedule
            </h3>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {user?.organization_name
                ? `${user.organization_name} · ${filtered.length} interview${filtered.length === 1 ? "" : "s"}`
                : `${filtered.length} interview${filtered.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={() => fetchInterviews()}
          >
            Refresh
          </Button>
        </div>

        {/* Status totals / legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {STATUS_ORDER.map((cat) => (
            <span key={cat} className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[cat].dot}`} />
              {STATUS_META[cat].label}
              <span className="font-semibold text-gray-800 dark:text-white/90">
                {totals[cat] ?? 0}
              </span>
            </span>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            label="Job Position"
            value={filters.position}
            onChange={(v) => setFilter("position", v)}
            options={options.positions}
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(v) => setFilter("status", v)}
            options={STATUS_ORDER}
            renderOption={(o) => STATUS_META[o as StatusCategory]?.label ?? o}
          />
          <FilterSelect
            label="Interviewer"
            value={filters.interviewer}
            onChange={(v) => setFilter("interviewer", v)}
            options={options.interviewers}
          />
          <FilterSelect
            label="Department"
            value={filters.department}
            onChange={(v) => setFilter("department", v)}
            options={options.departments}
          />
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="h-10 rounded-lg px-3 text-sm font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
            >
              Clear filters ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {/* ── Calendar ────────────────────────────────────────────────────── */}
      <div className="custom-calendar interview-calendar relative">
        {loading && interviews.length === 0 && (
          <div className="flex items-center justify-center py-24 text-sm text-gray-500 dark:text-gray-400">
            Loading interviews…
          </div>
        )}
        {!loading && interviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-24 text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              No interviews scheduled yet
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Scheduled interviews will appear here automatically.
            </p>
          </div>
        ) : (
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
            }}
            buttonText={{
              today: "Today",
              month: "Month",
              week: "Week",
              day: "Day",
              list: "Agenda",
            }}
            events={events}
            eventClick={handleEventClick}
            eventContent={renderEventContent}
            dayCellContent={renderDayCell}
            dayMaxEvents={3}
            moreLinkClick="popover"
            nowIndicator
            height="auto"
            displayEventTime
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", meridiem: "short" }}
            noEventsContent="No interviews in this range"
          />
        )}
      </div>

      {/* ── Details popup ───────────────────────────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-[560px]">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <DialogTitle className="text-xl font-semibold">
                    {selected.candidate_name}
                  </DialogTitle>
                  <StatusBadge category={selected.category} rawStatus={selected.status} />
                </div>
                {selected.candidate_email && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selected.candidate_email}
                  </p>
                )}
              </DialogHeader>

              <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                <DetailRow label="Job Position" value={selected.job_title} />
                <DetailRow label="Department" value={selected.department} />
                <DetailRow
                  label="Interview Date & Time"
                  value={formatInterviewMoment(
                    selected.interview_date,
                    selected.interview_timezone,
                  )}
                />
                <DetailRow label="Interview Round" value={selected.round} />
                <DetailRow label="Interviewer" value={selected.interviewer} />
                <DetailRow label="Current Status" value={selected.status} />
              </div>

              <div className="mt-6 flex items-center justify-between gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                {selected.meeting_link ? (
                  <a
                    href={selected.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
                  >
                    Join Meeting
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M7 17L17 7M17 7H8M17 7V16"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                ) : (
                  <span className="text-sm text-gray-400">No meeting link</span>
                )}
                <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Small presentational helpers ───────────────────────────────────────────
function FilterSelect({
  label,
  value,
  onChange,
  options,
  renderOption,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  renderOption?: (o: string) => string;
}) {
  return (
    <label className="flex min-w-[150px] flex-1 flex-col gap-1">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:ring-brand-500/20"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {renderOption ? renderOption(o) : o}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusBadge({
  category,
  rawStatus,
}: {
  category: string;
  rawStatus?: string;
}) {
  const meta = statusMeta(category);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}
      title={rawStatus}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-gray-800 dark:text-gray-100">
        {value && value.trim() ? value : "—"}
      </p>
    </div>
  );
}

export default Calendar;
