"use client";
import React from "react";
import { Bookmark, BookmarkCheck, Briefcase, Clock, GraduationCap, Loader2, MapPin } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { PIPELINE_LABELS, SOURCE_LABELS, type ResumeCardData } from "./types";
import {
  PIPELINE_TONES,
  avatarTone,
  initials,
  lpa,
  noticeLabel,
  qualityTone,
  tenure,
  timeAgo,
  years,
} from "./format";

const MAX_CHIPS = 5;

interface ResumeCardProps {
  item: ResumeCardData;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onToggleShortlist: () => void;
  onOpen: () => void;
  canEdit: boolean;
  busy?: boolean;
}

function Dot() {
  return <span className="text-gray-300 dark:text-gray-600">·</span>;
}

export default function ResumeCard({
  item,
  selected,
  onSelect,
  onToggleShortlist,
  onOpen,
  canEdit,
  busy,
}: ResumeCardProps) {
  const matched = new Set(item.matched_skills.map((s) => s.toLowerCase()));
  const chips = item.skills.slice(0, MAX_CHIPS);
  const moreChips = Math.max(0, item.skills_total - chips.length);
  const shortlisted = item.pipeline_status === "shortlisted";
  const ctc = lpa(item.current_ctc);
  const expected = lpa(item.expected_ctc);
  const notice = noticeLabel(item.notice_period_days);
  const exp = years(item.experience_years);
  const tenureText = tenure(item.current_tenure_years);
  const updated = timeAgo(item.resume_updated_at);
  const failed = item.parsing_status === "failed";

  return (
    <article
      // The whole card opens the profile; its own buttons and links act alone.
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("button, a, input, label, [role=checkbox]")) onOpen();
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm transition-all sm:flex-row sm:p-5",
        "hover:border-violet-200 hover:shadow-md dark:bg-gray-900/40 dark:hover:border-violet-500/30",
        selected ? "border-violet-300 ring-1 ring-violet-200 dark:border-violet-500/40 dark:ring-violet-500/20" : "border-gray-200 dark:border-white/10",
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onSelect(v === true)}
          aria-label={`Select ${item.candidate_name || "candidate"}`}
          className="mt-1 border-gray-300 data-[state=checked]:border-violet-600 data-[state=checked]:bg-violet-600 dark:border-white/20"
        />
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            avatarTone(item.candidate_email || item.id),
          )}
          aria-label={`Open ${item.candidate_name || "candidate"} profile`}
        >
          {initials(item.candidate_name)}
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="truncate text-left text-base font-semibold text-gray-900 hover:text-violet-700 dark:text-white dark:hover:text-violet-300"
            >
              {item.candidate_name || "Unnamed candidate"}
            </button>
            {failed ? (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30">
                Parsing failed
              </span>
            ) : (
              item.parse_quality != null && (
                <span
                  className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", qualityTone(item.parse_quality))}
                  title="How much of a profile could be read from the resume"
                >
                  CV parsed · {item.parse_quality}%
                </span>
              )
            )}
          </div>

          {(item.current_designation || item.current_company) && (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {item.current_designation && (
                <span className="font-medium text-gray-900 dark:text-gray-100">{item.current_designation}</span>
              )}
              {item.current_company && (
                <>
                  {item.current_designation ? " at " : ""}
                  {item.current_company}
                </>
              )}
              {tenureText && (
                <span className="text-gray-500 dark:text-gray-400"> · {tenureText}</span>
              )}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-700 dark:text-gray-300">
            {exp && (
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="h-4 w-4 text-gray-400" />
                {exp}
              </span>
            )}
            {(ctc || expected) && (
              <span>
                {ctc ?? "CTC not disclosed"}
                {expected && <span className="text-gray-500 dark:text-gray-400"> (expects {expected.replace(" LPA", "")})</span>}
              </span>
            )}
            {(item.city || item.location) && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-gray-400" />
                {item.city || item.location}
                {item.open_to_relocate && <span className="text-gray-500 dark:text-gray-400">· may relocate</span>}
              </span>
            )}
            {notice && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-gray-400" />
                {notice}
              </span>
            )}
          </div>

          {item.education && (
            <p className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
              <GraduationCap className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="truncate">{item.education}</span>
            </p>
          )}

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {chips.map((skill) => (
                <span
                  key={skill}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium",
                    matched.has(skill.toLowerCase())
                      ? "bg-violet-100 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/20 dark:text-violet-200 dark:ring-violet-500/30"
                      : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300",
                  )}
                >
                  {skill}
                </span>
              ))}
              {moreChips > 0 && (
                <button
                  type="button"
                  onClick={onOpen}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:text-violet-700 dark:text-gray-400"
                >
                  +{moreChips} more
                </button>
              )}
            </div>
          )}

          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
            {updated && <span>Updated {updated}</span>}
            {item.source && (
              <>
                {updated && <Dot />}
                <span>Source: {SOURCE_LABELS[item.source] ?? item.source}</span>
              </>
            )}
            {item.previous_company && (
              <>
                <Dot />
                <span>Previously {item.previous_company}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-row items-center justify-between gap-2 border-t border-gray-100 pt-3 sm:w-36 sm:flex-col sm:items-end sm:justify-start sm:border-0 sm:pt-0 dark:border-white/10">
        <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
          {item.match != null && (
            <div className="text-right leading-none">
              <p className="text-2xl font-bold text-violet-600 dark:text-violet-300">{item.match}%</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">match</p>
            </div>
          )}
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
              PIPELINE_TONES[item.pipeline_status] ?? PIPELINE_TONES.new,
            )}
          >
            {PIPELINE_LABELS[item.pipeline_status] ?? item.pipeline_status}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:mt-auto sm:flex-col sm:items-stretch">
          {canEdit && (item.pipeline_status === "new" || shortlisted) && (
            <button
              type="button"
              onClick={onToggleShortlist}
              disabled={busy}
              aria-pressed={shortlisted}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors disabled:opacity-60",
                shortlisted
                  ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-200"
                  : "border-gray-200 bg-white text-gray-800 hover:border-violet-300 hover:text-violet-700 dark:border-white/15 dark:bg-transparent dark:text-gray-200",
              )}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : shortlisted ? (
                <BookmarkCheck className="h-4 w-4" />
              ) : (
                <Bookmark className="h-4 w-4" />
              )}
              {shortlisted ? "Shortlisted" : "Shortlist"}
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 transition-colors hover:border-violet-300 hover:text-violet-700 dark:border-white/15 dark:bg-transparent dark:text-gray-200"
          >
            View profile
          </button>
        </div>
      </div>
    </article>
  );
}
