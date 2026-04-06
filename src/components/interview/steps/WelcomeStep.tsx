"use client";

import { Button } from "@/components/ui/button";
import { Clock, Home, User } from "lucide-react";
import type { JobConfig } from "@/hooks/interview/useInterviewSession";

interface Props {
  jobConfig: JobConfig;
  candidateName?: string;
  onNext: () => void;
}

export default function WelcomeStep({ jobConfig, candidateName, onNext }: Props) {
  const orgName = jobConfig.organization_name || "the company";
  const firstName = candidateName?.split(" ")[0];
  const estimatedMinutes = Math.ceil(jobConfig.max_questions * 2);

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-12 text-center">
      {/* Avatar */}
      <div className="w-20 h-20 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center mb-5">
        <User className="w-10 h-10 text-gray-400" />
      </div>

      {/* Greeting */}
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {firstName ? `Hi ${firstName}, welcome` : "Welcome"}
      </h1>
      <p className="text-gray-500 text-base mb-8 max-w-md">
        You&apos;ve been invited to interview for<br />
        <span className="font-semibold text-gray-700">{jobConfig.title}</span> at{" "}
        <span className="font-semibold text-gray-700">{orgName}</span>
      </p>

      {/* Tags */}
      <div className="flex flex-wrap justify-center gap-3 mb-8">
        <span className="text-sm border border-teal-300 text-teal-700 bg-teal-50 px-4 py-1.5 rounded-full font-medium">
          AI-assisted interview
        </span>
        <span className="text-sm border border-teal-300 text-teal-700 bg-teal-50 px-4 py-1.5 rounded-full font-medium">
          Human reviewed
        </span>
      </div>

      {/* Info card - Manager */}
      {jobConfig.manager_name && (
        <div className="w-full max-w-md mb-4">
          <div className="flex items-center gap-4 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 text-left">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">A human recruiter reviews every response</p>
              <p className="text-xs text-gray-500">
                {jobConfig.manager_name}
                {jobConfig.department && ` · ${jobConfig.department}`}
                {jobConfig.organization_name && `, ${jobConfig.organization_name}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Duration */}
      <div className="w-full max-w-md mb-3">
        <div className="flex items-center gap-4 px-5 py-3 text-left">
          <Clock className="w-5 h-5 text-teal-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900">About {estimatedMinutes} minutes</p>
            <p className="text-xs text-gray-500">{jobConfig.max_questions} questions, take your time</p>
          </div>
        </div>
      </div>

      {/* Flexibility */}
      <div className="w-full max-w-md mb-10">
        <div className="flex items-center gap-4 px-5 py-3 text-left">
          <Home className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Complete anytime in 48 hours</p>
            <p className="text-xs text-gray-500">No scheduling needed</p>
          </div>
        </div>
      </div>

      {/* Get Started */}
      <div className="w-full max-w-md">
        <Button
          onClick={onNext}
          className="w-full h-13 text-base bg-blue-600 hover:bg-blue-500 text-white gap-2 rounded-xl shadow-md shadow-blue-200"
        >
          Get started
        </Button>
      </div>

      {/* Contact info */}
      {jobConfig.manager_name && jobConfig.manager_email && (
        <p className="text-xs text-gray-400 mt-4">
          Questions? Contact {jobConfig.manager_name} at{" "}
          <a href={`mailto:${jobConfig.manager_email}`} className="text-blue-500 hover:underline">
            {jobConfig.manager_email}
          </a>
        </p>
      )}
    </div>
  );
}
