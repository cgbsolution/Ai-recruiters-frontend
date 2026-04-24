"use client";
import Image from "next/image";
import PreInterviewProgress from "./PreInterviewProgress";

interface Props {
  currentStep: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  children: React.ReactNode;
}

export default function PreInterviewLayout({ currentStep, children }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Dark navbar with branding + progress bar */}
      <div className="bg-gray-950 w-full shrink-0">
        <div className="flex items-center justify-between px-6 py-2">
          {/* Branding */}
          <div className="flex items-center shrink-0">
            <Image
              src="/images/logo/ai-white.svg"
              alt="anytimehire.ai"
              width={140}
              height={36}
              priority
              className="h-9 w-auto"
            />
          </div>
          {/* Progress steps */}
          <div className="flex-1 flex justify-center">
            <PreInterviewProgress currentStep={currentStep} />
          </div>
          {/* Spacer for centering */}
          <div className="w-[140px] shrink-0" />
        </div>
      </div>
      {/* White content area */}
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}
