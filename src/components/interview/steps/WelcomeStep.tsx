"use client";

import { Button } from "@/components/ui/button";
import { ArrowRight, Briefcase, Clock, MapPin } from "lucide-react";
import type { JobConfig } from "@/hooks/interview/useInterviewSession";

interface Props {
  jobConfig: JobConfig;
  onNext: () => void;
}

export default function WelcomeStep({ jobConfig, onNext }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12 bg-white text-center">
      <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mb-6">
        <Briefcase className="w-8 h-8 text-blue-500" />
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">AI Interview</h1>
      <p className="text-gray-500 text-base mb-10 max-w-md">
        You have been invited to interview for a position at CGB Solutions
      </p>

      <div className="bg-white border border-gray-200 rounded-2xl p-7 w-full max-w-md mb-10 text-left shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">{jobConfig.title}</h2>
        <p className="text-blue-600 font-medium text-sm mb-4">{jobConfig.department}</p>

        <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
          <MapPin className="w-4 h-4 text-gray-400" />
          <span>{jobConfig.location}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-500 text-sm mb-4">
          <Clock className="w-4 h-4 text-gray-400" />
          <span>~{Math.ceil(jobConfig.max_questions * 2)} minutes</span>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {jobConfig.skills.slice(0, 5).map((skill) => (
            <span
              key={skill}
              className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full border border-blue-100 font-medium"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>

      <div className="w-full max-w-md">
        <Button
          onClick={onNext}
          className="w-full h-13 text-base bg-blue-600 hover:bg-blue-500 text-white gap-2 rounded-xl shadow-md shadow-blue-200"
        >
          Continue
          <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
