"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TimePickerProps {
  value: string; // "HH:mm" 24h format
  onChange: (value: string) => void;
  className?: string;
}

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

  const [hourInput, setHourInput] = React.useState(String(h12));
  const [minInput, setMinInput] = React.useState(String(minute).padStart(2, "0"));

  // Sync inputs when value changes externally
  React.useEffect(() => {
    const { h12: ph, minute: pm } = parse24(value);
    setHourInput(String(ph));
    setMinInput(String(pm).padStart(2, "0"));
  }, [value]);

  const commitHour = () => {
    let h = parseInt(hourInput, 10);
    if (isNaN(h) || h < 1) h = 1;
    if (h > 12) h = 12;
    setHourInput(String(h));
    onChange(to24(h, minute, period));
  };

  const commitMinute = () => {
    let m = parseInt(minInput, 10);
    if (isNaN(m) || m < 0) m = 0;
    if (m > 59) m = 59;
    setMinInput(String(m).padStart(2, "0"));
    onChange(to24(h12, m, period));
  };

  const togglePeriod = (p: "AM" | "PM") => {
    onChange(to24(h12, minute, p));
  };

  return (
    <div className={cn("border rounded-xl bg-white p-3 w-full", className)}>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Hour input */}
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const next = h12 === 12 ? 1 : h12 + 1;
              setHourInput(String(next));
              onChange(to24(next, minute, period));
            }}
            className="w-full text-gray-400 hover:text-blue-600 text-lg leading-none py-0.5"
          >▲</button>
          <input
            type="text"
            value={hourInput}
            onChange={(e) => setHourInput(e.target.value.replace(/\D/g, "").slice(0, 2))}
            onBlur={commitHour}
            onKeyDown={(e) => e.key === "Enter" && commitHour()}
            className="w-12 h-10 text-center text-lg font-semibold border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
            maxLength={2}
          />
          <button
            type="button"
            onClick={() => {
              const next = h12 === 1 ? 12 : h12 - 1;
              setHourInput(String(next));
              onChange(to24(next, minute, period));
            }}
            className="w-full text-gray-400 hover:text-blue-600 text-lg leading-none py-0.5"
          >▼</button>
        </div>

        <span className="text-2xl font-bold text-gray-400 mb-0.5">:</span>

        {/* Minute input */}
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const next = (minute + 1) % 60;
              setMinInput(String(next).padStart(2, "0"));
              onChange(to24(h12, next, period));
            }}
            className="w-full text-gray-400 hover:text-blue-600 text-lg leading-none py-0.5"
          >▲</button>
          <input
            type="text"
            value={minInput}
            onChange={(e) => setMinInput(e.target.value.replace(/\D/g, "").slice(0, 2))}
            onBlur={commitMinute}
            onKeyDown={(e) => e.key === "Enter" && commitMinute()}
            className="w-12 h-10 text-center text-lg font-semibold border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
            maxLength={2}
          />
          <button
            type="button"
            onClick={() => {
              const next = minute === 0 ? 59 : minute - 1;
              setMinInput(String(next).padStart(2, "0"));
              onChange(to24(h12, next, period));
            }}
            className="w-full text-gray-400 hover:text-blue-600 text-lg leading-none py-0.5"
          >▼</button>
        </div>

        {/* AM / PM toggle */}
        <div className="flex flex-col gap-1.5 ml-1">
          {(["AM", "PM"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePeriod(p)}
              className={cn(
                "w-12 h-10 rounded-lg text-sm font-semibold transition-colors",
                p === period
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
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
