"use client";

import { Check } from "lucide-react";

interface Props {
  currentStep: 1 | 2 | 3 | 4;
}

const STEPS = [
  { num: "01", label: "Permissions" },
  { num: "02", label: "ID Verification" },
  { num: "03", label: "Device Test" },
  { num: "04", label: "Interview Prep" },
];

export default function PreInterviewProgress({ currentStep }: Props) {
  return (
    <div className="flex items-center justify-center py-5 px-8 w-full">
      <div className="flex items-center">
        {STEPS.map((step, i) => {
          const stepNum = i + 1;
          const isDone = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          return (
            <div key={i} className="flex items-center">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  isDone
                    ? "bg-green-500 text-white"
                    : isActive
                    ? "bg-blue-500 text-white"
                    : "text-gray-400"
                }`}
              >
                {isDone ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <span className="text-xs font-bold">{step.num}</span>
                )}
                <span>{step.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-px w-10 mx-1 ${
                    stepNum < currentStep ? "bg-blue-500" : "bg-gray-700"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
