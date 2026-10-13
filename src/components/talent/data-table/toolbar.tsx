"use client";

import React from "react";
import type { Table } from "@tanstack/react-table";
import { Search, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A search box with an icon and a clear button (controlled). */
export function SearchBox({
  value,
  onChange,
  placeholder = "Search…",
  className,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 pr-8 pl-8"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear search"
          className="absolute top-1/2 right-0.5 size-7 -translate-y-1/2"
          onClick={() => onChange("")}
        >
          <X />
        </Button>
      )}
    </div>
  );
}

/** Show / hide columns (only columns that allow hiding). */
export function ViewOptions<TData>({ table }: { table: Table<TData> }) {
  const columns = table.getAllColumns().filter((c) => c.getCanHide() && typeof c.accessorFn !== "undefined");
  if (!columns.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="ml-auto h-8 px-2.5">
          <Settings2 /> View
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.id}
            checked={c.getIsVisible()}
            onCheckedChange={(v) => c.toggleVisibility(!!v)}
            onSelect={(e) => e.preventDefault()}
          >
            {(c.columnDef.meta as { label?: string } | undefined)?.label ?? c.id}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The row above a table: search, filters, a Reset button when anything is
 * filtered, actions and the View menu.
 */
export function Toolbar<TData>({
  table,
  children,
  actions,
  filtered,
  onReset,
}: {
  table?: Table<TData>;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  /** Server-side tables say whether a filter is active; client tables are read from the table. */
  filtered?: boolean;
  onReset?: () => void;
}) {
  const active =
    filtered ?? (!!table && (table.getState().columnFilters.length > 0 || !!table.getState().globalFilter));
  const reset = () => {
    if (onReset) onReset();
    table?.resetColumnFilters();
    table?.setGlobalFilter("");
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      {active && (
        <Button variant="ghost" className="h-8 px-2.5" onClick={reset}>
          Reset <X />
        </Button>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {actions}
        {table && <ViewOptions table={table} />}
      </div>
    </div>
  );
}
