"use client";
import React, { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  EXPERIENCE_PRESETS,
  FRESHNESS_OPTIONS,
  QUALITY_OPTIONS,
  type FacetOption,
  type Facets,
  type Filters,
  type Quality,
} from "./types";

const VISIBLE_OPTIONS = 7;

type ListKey = "ctc" | "notice" | "city" | "skills" | "certs" | "education" | "pipeline" | "source";

interface FiltersPanelProps {
  filters: Filters;
  facets: Facets | null;
  onChange: (patch: Partial<Filters>) => void;
  onClearAll: () => void;
  activeCount: number;
}

// ── Building blocks ──────────────────────────────────────────────────────────

function Section({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  badge?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-gray-100 px-4 py-3.5 first:border-t-0 dark:border-white/10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          {title}
          {!!badge && (
            <span className="rounded-full bg-violet-600 px-1.5 text-[10px] font-bold leading-4 text-white">{badge}</span>
          )}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-gray-400 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

function OptionRow({
  option,
  checked,
  onToggle,
}: {
  option: FacetOption;
  checked: boolean;
  onToggle: () => void;
}) {
  const empty = option.count === 0 && !checked;
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-md py-1 text-sm",
        empty ? "cursor-default text-gray-400 dark:text-gray-600" : "text-gray-800 dark:text-gray-200",
      )}
    >
      <Checkbox
        checked={checked}
        disabled={empty}
        onCheckedChange={onToggle}
        className="size-4 border-gray-300 data-[state=checked]:border-violet-600 data-[state=checked]:bg-violet-600 dark:border-white/20"
      />
      <span className="min-w-0 flex-1 truncate" title={option.label}>
        {option.label}
      </span>
      <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{option.count.toLocaleString()}</span>
    </label>
  );
}

function OptionList({
  options,
  selected,
  onToggle,
  searchable,
  noun,
}: {
  options: FacetOption[];
  selected: string[];
  onToggle: (key: string) => void;
  searchable?: boolean;
  noun?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");

  // Keep ticked values visible even when they fell out of the counted list.
  const merged = useMemo(() => {
    const known = new Set(options.flatMap((o) => [o.key.toLowerCase(), o.label.toLowerCase()]));
    const missing = selected
      .filter((s) => !known.has(s.toLowerCase()))
      .map((s) => ({ key: s, label: s, count: 0 }));
    return [...missing, ...options];
  }, [options, selected]);

  const isChecked = (o: FacetOption) =>
    selected.some((s) => s.toLowerCase() === o.key.toLowerCase() || s.toLowerCase() === o.label.toLowerCase());

  const filtered = query
    ? merged.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : merged;
  const visible = expanded || query ? filtered : filtered.slice(0, VISIBLE_OPTIONS);
  const hidden = merged.length - VISIBLE_OPTIONS;

  if (!merged.length) {
    return <p className="text-xs text-gray-400">No {noun ?? "values"} in these results.</p>;
  }

  return (
    <div>
      {searchable && expanded && (
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Find ${noun ?? "a value"}…`}
            className="h-8 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-sm outline-none focus:border-violet-400 dark:border-white/10 dark:bg-transparent"
          />
        </div>
      )}
      <div className={cn("space-y-0.5", expanded && "max-h-72 overflow-y-auto pr-1")}>
        {visible.map((o) => (
          <OptionRow key={o.key} option={o} checked={isChecked(o)} onToggle={() => onToggle(o.label)} />
        ))}
        {query && !filtered.length && <p className="py-1 text-xs text-gray-400">No match.</p>}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => {
            setExpanded((e) => !e);
            setQuery("");
          }}
          className="mt-2 text-sm font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-300"
        >
          {expanded ? "Show less" : `Show ${hidden.toLocaleString()} more`}
        </button>
      )}
    </div>
  );
}

const selectClass =
  "h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-sm text-gray-800 outline-none focus:border-violet-400 dark:border-white/10 dark:bg-white/5 dark:text-gray-200";
const numberClass =
  "h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-violet-400 dark:border-white/10 dark:bg-white/5 dark:text-gray-100";

// ── Panel ────────────────────────────────────────────────────────────────────

export default function FiltersPanel({ filters, facets, onChange, onClearAll, activeCount }: FiltersPanelProps) {
  const toggle = (key: ListKey, value: string) => {
    const list = filters[key];
    const has = list.some((v) => v.toLowerCase() === value.toLowerCase());
    onChange({
      [key]: has ? list.filter((v) => v.toLowerCase() !== value.toLowerCase()) : [...list, value],
      page: 1,
    } as Partial<Filters>);
  };

  // Bucketed sections (CTC, notice, education...) show labels but store keys.
  const byKey = (key: ListKey, options: FacetOption[]) => (label: string) => {
    const option = options.find((o) => o.label === label);
    toggle(key, option ? option.key : label);
  };
  const selectedLabels = (key: ListKey, options: FacetOption[]) =>
    filters[key].map((k) => options.find((o) => o.key === k)?.label ?? k);

  const ctc = facets?.ctc ?? [];
  const notice = facets?.notice ?? [];
  const education = facets?.education ?? [];
  const pipeline = facets?.pipeline ?? [];
  const source = facets?.source ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-gray-900/40">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5 dark:border-white/10">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Filters</h2>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-sm font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-300"
          >
            Clear all
          </button>
        )}
      </div>

      <Section title="Experience (years)">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={60}
            inputMode="decimal"
            placeholder="Min"
            aria-label="Minimum experience in years"
            value={filters.expMin}
            onChange={(e) => onChange({ expMin: e.target.value, page: 1 })}
            className={numberClass}
          />
          <span className="text-sm text-gray-500">to</span>
          <input
            type="number"
            min={0}
            max={60}
            inputMode="decimal"
            placeholder="Max"
            aria-label="Maximum experience in years"
            value={filters.expMax}
            onChange={(e) => onChange({ expMax: e.target.value, page: 1 })}
            className={numberClass}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXPERIENCE_PRESETS.map((p) => {
            const active = filters.expMin === p.min && filters.expMax === p.max;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() =>
                  onChange(active ? { expMin: "", expMax: "", page: 1 } : { expMin: p.min, expMax: p.max, page: 1 })
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200"
                    : "border-gray-200 text-gray-700 hover:border-violet-300 dark:border-white/15 dark:text-gray-300",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Current CTC" badge={filters.ctc.length}>
        <OptionList options={ctc} selected={selectedLabels("ctc", ctc)} onToggle={byKey("ctc", ctc)} />
      </Section>

      <Section title="Notice period" badge={filters.notice.length}>
        <OptionList options={notice} selected={selectedLabels("notice", notice)} onToggle={byKey("notice", notice)} />
      </Section>

      <Section title="Current location" badge={filters.city.length + (filters.relocate ? 1 : 0)}>
        <OptionList
          options={facets?.city ?? []}
          selected={filters.city}
          onToggle={(label) => toggle("city", label)}
          searchable
          noun="locations"
        />
        <div className="mt-2 border-t border-gray-100 pt-2 dark:border-white/10">
          <OptionRow
            option={{ key: "relocate", label: "Open to relocate", count: facets?.relocate ?? 0 }}
            checked={filters.relocate}
            onToggle={() => onChange({ relocate: !filters.relocate, page: 1 })}
          />
        </div>
      </Section>

      <Section title="Key skills" badge={filters.skills.length}>
        <div className="mb-3 grid grid-cols-2 rounded-xl bg-gray-100 p-1 text-sm dark:bg-white/5">
          {(["all", "any"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ skillsMode: mode, page: 1 })}
              className={cn(
                "rounded-lg py-1.5 font-medium transition-colors",
                filters.skillsMode === mode
                  ? "bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400",
              )}
            >
              {mode === "all" ? "Must have all" : "Any of these"}
            </button>
          ))}
        </div>
        <OptionList
          options={facets?.skills ?? []}
          selected={filters.skills}
          onToggle={(label) => toggle("skills", label)}
          searchable
          noun="skills"
        />
      </Section>

      <Section title="Certifications" badge={filters.certs.length} defaultOpen={filters.certs.length > 0}>
        <OptionList
          options={facets?.certs ?? []}
          selected={filters.certs}
          onToggle={(label) => toggle("certs", label)}
          searchable
          noun="certifications"
        />
      </Section>

      <Section title="Highest education" badge={filters.education.length} defaultOpen={filters.education.length > 0}>
        <OptionList
          options={education}
          selected={selectedLabels("education", education)}
          onToggle={byKey("education", education)}
        />
      </Section>

      <Section title="Resume freshness" badge={filters.freshness ? 1 : 0}>
        <select
          value={filters.freshness}
          onChange={(e) => onChange({ freshness: e.target.value, page: 1 })}
          className={selectClass}
          aria-label="Resume freshness"
        >
          {FRESHNESS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Section>

      <Section title="Pipeline status" badge={filters.pipeline.length}>
        <OptionList
          options={pipeline}
          selected={selectedLabels("pipeline", pipeline)}
          onToggle={byKey("pipeline", pipeline)}
        />
      </Section>

      <Section title="Resume source" badge={filters.source.length}>
        <OptionList options={source} selected={selectedLabels("source", source)} onToggle={byKey("source", source)} />
      </Section>

      <Section title="CV parse quality" badge={filters.quality ? 1 : 0}>
        <select
          value={filters.quality}
          onChange={(e) => onChange({ quality: e.target.value as Quality, page: 1 })}
          className={selectClass}
          aria-label="CV parse quality"
        >
          {QUALITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Section>
    </div>
  );
}
