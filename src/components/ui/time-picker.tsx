"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TimePickerProps {
  value: string; // "HH:mm" 24h format
  onChange: (value: string) => void;
  className?: string;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => (i === 0 ? 12 : i));
const MINUTES = [0, 15, 30, 45];

function parse24(value: string) {
  const [hStr, mStr] = value.split(":");
  const h24 = parseInt(hStr, 10) || 0;
  const minute = parseInt(mStr, 10) || 0;
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return { h12, minute, period };
}

function to24(h12: number, minute: number, period: "AM" | "PM") {
  let h24 = h12;
  if (period === "AM" && h12 === 12) h24 = 0;
  else if (period === "PM" && h12 !== 12) h24 = h12 + 12;
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function TimePicker({ value, onChange, className }: TimePickerProps) {
  const { h12, minute, period } = parse24(value);

  const setHour = (h: number) => onChange(to24(h, minute, period));
  const setMinute = (m: number) => onChange(to24(h12, m, period));
  const setPeriod = (p: "AM" | "PM") => onChange(to24(h12, minute, p));

  return (
    <div className={cn("border rounded-xl bg-white overflow-hidden", className)}>
      <div className="flex divide-x divide-gray-100" style={{ height: 200 }}>
        {/* Hour column */}
        <ScrollArea className="flex-1">
          <div className="p-1 space-y-0.5">
            {HOURS_12.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHour(h)}
                className={cn(
                  "w-full py-2 rounded-lg text-sm font-medium transition-colors",
                  h === h12
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-blue-50 hover:text-blue-600"
                )}
              >
                {h}
              </button>
            ))}
          </div>
        </ScrollArea>

        {/* Minute column */}
        <ScrollArea className="flex-1">
          <div className="p-1 space-y-0.5">
            {MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinute(m)}
                className={cn(
                  "w-full py-2 rounded-lg text-sm font-medium transition-colors",
                  m === minute
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-blue-50 hover:text-blue-600"
                )}
              >
                {String(m).padStart(2, "0")}
              </button>
            ))}
          </div>
        </ScrollArea>

        {/* AM / PM column */}
        <div className="flex flex-col p-1 space-y-0.5" style={{ width: 56 }}>
          {(["AM", "PM"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "flex-1 rounded-lg text-sm font-semibold transition-colors",
                p === period
                  ? "bg-blue-600 text-white"
                  : "text-gray-500 hover:bg-blue-50 hover:text-blue-600"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
