"use client";

import React from "react";
import type { Table } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SIZES = [10, 20, 50, 100];

/** Rows per page, "x–y of n", and first / previous / next / last. */
export function DataTablePagination<TData>({ table, total }: { table: Table<TData>; total?: number }) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const count = total ?? table.getFilteredRowModel().rows.length;
  const pages = Math.max(1, table.getPageCount());
  const from = count === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(count, (pageIndex + 1) * pageSize);
  const selected = table.getFilteredSelectedRowModel().rows.length;

  return (
    <div className="flex flex-col-reverse gap-3 px-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <div className="tabular-nums">
        {selected > 0 ? `${selected} of ${count.toLocaleString()} selected · ` : ""}
        {from.toLocaleString()}–{to.toLocaleString()} of {count.toLocaleString()}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => table.setPagination({ pageIndex: 0, pageSize: Number(v) })}>
            <SelectTrigger size="sm" className="h-8 w-[72px]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="whitespace-nowrap tabular-nums">
          Page {pageIndex + 1} of {pages}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="hidden size-8 sm:inline-flex" aria-label="First page"
            disabled={!table.getCanPreviousPage()} onClick={() => table.setPageIndex(0)}>
            <ChevronsLeft />
          </Button>
          <Button variant="outline" size="icon" className="size-8" aria-label="Previous page"
            disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" className="size-8" aria-label="Next page"
            disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            <ChevronRight />
          </Button>
          <Button variant="outline" size="icon" className="hidden size-8 sm:inline-flex" aria-label="Last page"
            disabled={!table.getCanNextPage()} onClick={() => table.setPageIndex(pages - 1)}>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
