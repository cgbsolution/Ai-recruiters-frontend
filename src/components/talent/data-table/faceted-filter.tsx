"use client";

import React from "react";
import type { Column } from "@tanstack/react-table";
import { Check, PlusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  count?: number;
}

/**
 * Multi-select filter (Popover + Command): searchable options with counts,
 * the picks shown as badges on the button. Controlled, so it works for
 * server-side filters too — see ColumnFilter for a table-bound version.
 */
export function FacetedFilter({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: FilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const picked = new Set(selected);
  const toggle = (value: string) => {
    const next = new Set(picked);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange([...next]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-8 border-dashed px-2.5">
          <PlusCircle />
          {title}
          {picked.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-1 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                {picked.size}
              </Badge>
              <div className="hidden gap-1 lg:flex">
                {picked.size > 2 ? (
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {picked.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((o) => picked.has(o.value))
                    .map((o) => (
                      <Badge key={o.value} variant="secondary" className="rounded-sm px-1 font-normal">
                        {o.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const on = picked.has(o.value);
                return (
                  <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => toggle(o.value)}>
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[4px] border",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-input [&_svg]:invisible",
                      )}
                    >
                      <Check className="size-3.5 text-current" />
                    </div>
                    {o.icon && <o.icon className="size-4 text-muted-foreground" />}
                    <span className="truncate">{o.label}</span>
                    {o.count != null && (
                      <span className="ml-auto flex size-4 items-center justify-center font-mono text-xs tabular-nums">
                        {o.count}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {picked.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className="justify-center text-center">
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** FacetedFilter bound to a client-side column (give the column filterFn: "oneOf"); counts come from the rows. */
export function ColumnFilter<TData, TValue>({
  column,
  title,
  options,
}: {
  column?: Column<TData, TValue>;
  title: string;
  options: FilterOption[];
}) {
  if (!column) return null;
  const facets = column.getFacetedUniqueValues();
  const selected = (column.getFilterValue() as string[] | undefined) ?? [];
  return (
    <FacetedFilter
      title={title}
      options={options.map((o) => ({ ...o, count: o.count ?? facets.get(o.value) ?? 0 }))}
      selected={selected}
      onChange={(v) => column.setFilterValue(v.length ? v : undefined)}
    />
  );
}
