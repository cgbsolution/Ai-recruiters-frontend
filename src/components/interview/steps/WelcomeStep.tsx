"use client";

import { Button } from "@/components/ui/button";
import { Briefcase, Clock, MapPin, UserPlus } from "lucide-react";
import type { JobConfig } from "@/hooks/interview/useInterviewSession";

interface Props {
  jobConfig: JobConfig;
  onNext: () => void;
}

export default function WelcomeStep({ jobConfig, onNext }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center mb-8">
        <Briefcase className="w-10 h-10 text-white" />
      </div>

      <h1 className="text-4xl font-bold text-white mb-3">AI Interview</h1>
      <p className="text-gray-400 text-lg mb-10 max-w-md">
        You have been invited to interview for a position at CGB Solutions
      </p>

      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-md mb-10 text-left space-y-4">
        <h2 className="text-2xl font-semibold text-white">{jobConfig.title}</h2>
        <p className="text-blue-400 font-medium">{jobConfig.department}</p>

        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <MapPin className="w-4 h-4" />
          <span>{jobConfig.location}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Clock className="w-4 h-4" />
          <span>~{Math.ceil(jobConfig.max_questions * 2)} minutes</span>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {jobConfig.skills.slice(0, 5).map((skill) => (
            <span
              key={skill}
              className="text-xs bg-blue-900/40 text-blue-300 px-3 py-1 rounded-full"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>

      <div className="w-full max-w-md">
        <Button
          onClick={onNext}
          className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700 gap-3"
        >
          <UserPlus className="w-5 h-5" />
          Start New Interview
        </Button>
      </div>
    </div>
  );
}
