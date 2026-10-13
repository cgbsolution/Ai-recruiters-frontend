"use client";

import React, { useEffect, useState } from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  type FilterFn,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Table as TanTable,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DataTablePagination } from "./pagination";

declare module "@tanstack/react-table" {
  interface FilterFns {
    /** Exact match against any picked value (the built-in arrIncludesSome does substring matching on strings). */
    oneOf: FilterFn<unknown>;
  }
}

/** Facet filter: the cell's value (as text, null as "") is one of the picked values. */
const oneOf: FilterFn<unknown> = (row, columnId, value: string[]) =>
  !value?.length || value.includes(String(row.getValue(columnId) ?? ""));
oneOf.autoRemove = (value: string[] | undefined) => !value?.length;

/** Server-side paging: the table shows `data` as the current page of `total` rows. */
export interface ServerPaging {
  pageIndex: number;
  pageSize: number;
  total: number;
  onChange: (next: { pageIndex: number; pageSize: number }) => void;
}

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[] | null;
  /** Remembers hidden columns per table in this browser. */
  storageKey?: string;
  getRowId?: (row: TData, index: number) => string;
  /** The toolbar above the table; receives the table so filters can bind to columns. */
  toolbar?: (table: TanTable<TData>) => React.ReactNode;
  /** Shown above the table while rows are selected (needs a selectColumn()). */
  bulkActions?: (rows: TData[], clear: () => void) => React.ReactNode;
  /** Extra content under a row, toggled by clicking it. */
  renderExpanded?: (row: TData) => React.ReactNode;
  onRowClick?: (row: TData) => void;
  /** Extra classes for a row, e.g. to tint rows that need attention. */
  rowClassName?: (row: TData) => string | undefined;
  empty?: React.ReactNode;
  server?: ServerPaging;
  pageSize?: number;
  initialSorting?: SortingState;
  initialHidden?: string[];
  /** Rows (by row id) selected when the table first shows. */
  initialSelected?: string[];
  className?: string;
  /** Hide the footer (small tables). */
  noPagination?: boolean;
}

function loadHidden(key: string | undefined, fallback: string[]): VisibilityState {
  const hidden = Object.fromEntries(fallback.map((id) => [id, false]));
  if (!key) return hidden;
  try {
    const raw = localStorage.getItem(`talent-table:${key}`);
    return raw ? (JSON.parse(raw) as VisibilityState) : hidden;
  } catch {
    return hidden;
  }
}

/**
 * shadcn data table (TanStack Table): sorting, faceted filters, column
 * visibility, pagination (client or server), expandable rows and selection.
 */
export function DataTable<TData>({
  columns,
  data,
  storageKey,
  getRowId,
  toolbar,
  bulkActions,
  renderExpanded,
  onRowClick,
  rowClassName,
  empty,
  server,
  pageSize = 20,
  initialSorting = [],
  initialHidden = [],
  initialSelected,
  className,
  noPagination,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(() =>
    Object.fromEntries((initialSelected ?? []).map((id) => [id, true])),
  );
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => loadHidden(undefined, initialHidden));
  const [clientPaging, setClientPaging] = useState<PaginationState>({ pageIndex: 0, pageSize });

  // Read the saved column choice after mount (localStorage isn't there during SSR).
  useEffect(() => {
    setColumnVisibility(loadHidden(storageKey, initialHidden));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(`talent-table:${storageKey}`, JSON.stringify(columnVisibility));
    } catch {
      /* storage unavailable */
    }
  }, [storageKey, columnVisibility]);

  const pagination: PaginationState = server ? { pageIndex: server.pageIndex, pageSize: server.pageSize } : clientPaging;

  const table = useReactTable({
    data: data ?? [],
    columns,
    getRowId,
    state: { sorting, columnFilters, globalFilter, rowSelection, expanded, columnVisibility, pagination },
    enableRowSelection: true,
    // A server page can't be re-sorted here; its order is the server's.
    enableSorting: !server,
    getRowCanExpand: () => !!renderExpanded,
    onSortingChange: setSorting,
    onColumnFiltersChange: (u) => {
      setColumnFilters(u);
      setClientPaging((p) => ({ ...p, pageIndex: 0 }));
    },
    onGlobalFilterChange: (u) => {
      setGlobalFilter(u);
      setClientPaging((p) => ({ ...p, pageIndex: 0 }));
    },
    globalFilterFn: "includesString",
    filterFns: { oneOf },
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: (u) => {
      const next = typeof u === "function" ? u(pagination) : u;
      if (server) server.onChange(next);
      else setClientPaging(next);
    },
    manualPagination: !!server,
    // Refreshed data (polling, an invite) keeps the page you're on; see the clamp below.
    autoResetPageIndex: false,
    manualFiltering: !!server,
    manualSorting: !!server,
    rowCount: server?.total,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: server ? undefined : getFilteredRowModel(),
    getSortedRowModel: server ? undefined : getSortedRowModel(),
    getPaginationRowModel: server ? undefined : getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  // If the data shrank under the current page, step back to the last page that exists.
  const pageCount = table.getPageCount();
  useEffect(() => {
    if (!server && pageCount > 0 && clientPaging.pageIndex > pageCount - 1) {
      setClientPaging((p) => ({ ...p, pageIndex: pageCount - 1 }));
    }
  }, [server, pageCount, clientPaging.pageIndex]);

  const visible = table.getVisibleLeafColumns().length;
  const rows = table.getRowModel().rows;
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);

  const rowProps = (row: Row<TData>) => {
    const clickable = !!renderExpanded || !!onRowClick;
    return {
      className: cn(clickable && "cursor-pointer", rowClassName?.(row.original)),
      "data-state": row.getIsSelected() || row.getIsExpanded() ? "selected" : undefined,
      onClick: clickable
        ? (e: React.MouseEvent) => {
            // Links, buttons and checkboxes inside the row keep their own click.
            if ((e.target as HTMLElement).closest("a,button,input,[role=checkbox],[role=menuitem]")) return;
            if (renderExpanded) row.toggleExpanded();
            else onRowClick?.(row.original);
          }
        : undefined,
    };
  };

  return (
    <div className={cn("space-y-3", className)}>
      {toolbar?.(table)}
      {bulkActions && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">{selected.length} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">{bulkActions(selected, () => table.resetRowSelection())}</div>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    className="h-10 first:pl-4 last:pr-4"
                    style={header.column.columnDef.size ? { width: header.getSize() } : undefined}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {data === null &&
              Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: visible }, (__, j) => (
                    <TableCell key={j} className="first:pl-4 last:pr-4">
                      <Skeleton className="h-5 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {data !== null &&
              rows.map((row) => (
                <React.Fragment key={row.id}>
                  <TableRow {...rowProps(row)}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-2.5 first:pl-4 last:pr-4">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && renderExpanded && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={visible} className="whitespace-normal px-4 py-3">
                        {renderExpanded(row.original)}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            {data !== null && rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visible} className="h-40 whitespace-normal text-center">
                  {empty ?? <span className="text-sm text-muted-foreground">No results.</span>}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {!noPagination && data !== null && <DataTablePagination table={table} total={server?.total} />}
    </div>
  );
}
