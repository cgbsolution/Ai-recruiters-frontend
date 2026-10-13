"use client";

import React from "react";
import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** A column title with a menu to sort it or hide it (when the column allows). */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
  align = "left",
}: {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
  align?: "left" | "right";
}) {
  const label = <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</span>;
  if (!column.getCanSort() && !column.getCanHide()) {
    return <div className={cn(align === "right" && "text-right", className)}>{label}</div>;
  }
  const sorted = column.getIsSorted();
  // The arrows only where sorting works (a server-paged table can't re-sort a page).
  const Icon = !column.getCanSort() ? null : sorted === "desc" ? ArrowDown : sorted === "asc" ? ArrowUp : ChevronsUpDown;
  return (
    <div className={cn("flex items-center", align === "right" && "justify-end", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="-ml-2.5 h-8 gap-1.5 px-2.5 data-[state=open]:bg-accent">
            {label}
            {Icon && <Icon className={cn("size-3.5", sorted ? "text-foreground" : "text-muted-foreground/60")} />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align === "right" ? "end" : "start"}>
          {column.getCanSort() && (
            <>
              <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
                <ArrowUp /> Ascending
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
                <ArrowDown /> Descending
              </DropdownMenuItem>
            </>
          )}
          {column.getCanSort() && column.getCanHide() && <DropdownMenuSeparator />}
          {column.getCanHide() && (
            <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
              <EyeOff /> Hide column
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
