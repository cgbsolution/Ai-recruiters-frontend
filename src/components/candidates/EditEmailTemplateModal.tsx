"use client";
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Mail,
  Eye,
  RotateCcw,
  Save,
  X,
  Calendar,
  Link2,
  CheckCircle2,
  XCircle,
  Plus,
  Type,
  AtSign,
} from "lucide-react";

export interface EmailTemplateData {
  subject: string;
  introText: string;
  extraHeading: string;
  extraBody: string;
  ccEmails: string;
}

interface EditEmailTemplateModalProps {
  open: boolean;
  onClose: () => void;
  initial?: Partial<EmailTemplateData>;
  candidateName: string;
  jobTitle: string;
  interviewDate: string;
  interviewUrl: string;
  joiningFlexibility?: "scheduled_time" | "anytime";
  onSave: (template: EmailTemplateData) => void;
}

export default function EditEmailTemplateModal({
  open,
  onClose,
  initial,
  candidateName,
  jobTitle,
  interviewDate,
  interviewUrl,
  joiningFlexibility = "anytime",
  onSave,
}: EditEmailTemplateModalProps) {
  const defaultTemplate: EmailTemplateData = {
    subject: `Your Interview Schedule for ${jobTitle}`,
    introText: `You are shortlisted for an AI Interview round for the role ${jobTitle} at company CGBiz Solutions Private limited`,
    extraHeading: "",
    extraBody: "",
    ccEmails: "",
  };

  const [template, setTemplate] = useState<EmailTemplateData>({
    subject: initial?.subject || defaultTemplate.subject,
    introText: initial?.introText || defaultTemplate.introText,
    extraHeading: initial?.extraHeading || "",
    extraBody: initial?.extraBody || "",
    ccEmails: initial?.ccEmails || "",
  });

  const handleChange = (key: keyof EmailTemplateData, value: string) => {
    setTemplate((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setTemplate({ ...defaultTemplate });
  };

  const handleSave = () => {
    onSave(template);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1100px] p-0 gap-0 max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Mail className="w-4.5 h-4.5 text-blue-600" />
            </div>
            <div>
              <DialogHeader className="p-0">
                <DialogTitle className="text-base font-semibold text-gray-900">
                  Edit Email Template
                </DialogTitle>
              </DialogHeader>
              <p className="text-xs text-gray-500 mt-0.5">
                Customize the interview invitation email for {candidateName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-xs text-gray-500 hover:text-gray-700 gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Default
            </Button>
          </div>
        </div>

        {/* Body: 2-column */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_1fr] min-h-0 overflow-hidden">
          {/* Left: Editor */}
          <div className="p-5 space-y-4 overflow-y-auto border-r border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <Type className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">
                Email Content
              </span>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Email Subject
              </Label>
              <Input
                value={template.subject}
                onChange={(e) => handleChange("subject", e.target.value)}
                className="text-sm"
                placeholder="Enter email subject line"
              />
              <p className="text-[10px] text-gray-400">
                Subject line only — not shown in the preview
              </p>
            </div>

            {/* Intro Text */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Introduction
              </Label>
              <Textarea
                rows={3}
                value={template.introText}
                onChange={(e) => handleChange("introText", e.target.value)}
                className="text-sm resize-none"
                placeholder="Write the main introductory paragraph..."
              />
            </div>

            {/* Divider */}
            <div className="border-t border-dashed border-gray-200 pt-3">
              <div className="flex items-center gap-2 mb-3">
                <Plus className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">
                  Additional Content
                </span>
                <span className="text-[10px] text-gray-400">(optional)</span>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Extra Section Heading
                  </Label>
                  <Input
                    placeholder="e.g. Important Instructions"
                    value={template.extraHeading}
                    onChange={(e) =>
                      handleChange("extraHeading", e.target.value)
                    }
                    className="text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Extra Section Body
                  </Label>
                  <Textarea
                    rows={3}
                    placeholder="Additional instructions or information..."
                    value={template.extraBody}
                    onChange={(e) => handleChange("extraBody", e.target.value)}
                    className="text-sm resize-none"
                  />
                </div>
              </div>
            </div>

            {/* CC Emails */}
            <div className="border-t border-dashed border-gray-200 pt-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <AtSign className="w-3.5 h-3.5 text-gray-400" />
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  CC Recipients
                </Label>
              </div>
              <Input
                placeholder="email1@example.com, email2@example.com"
                value={template.ccEmails}
                onChange={(e) => handleChange("ccEmails", e.target.value)}
                className="text-sm"
              />
              <p className="text-[10px] text-gray-400">
                Separate multiple emails with commas
              </p>
            </div>
          </div>

          {/* Right: Preview */}
          <div className="bg-gray-50 p-5 overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">
                Live Preview
              </span>
            </div>

            {/* Email card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden max-w-[420px] mx-auto">
              {/* Email header bar */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 text-center">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-white font-semibold text-base">
                  Your Interview has been scheduled
                </h2>
              </div>

              {/* Email body */}
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-gray-700">
                  Hello{" "}
                  <span className="font-medium">{candidateName}</span>,
                </p>

                <p className="text-sm text-gray-600 leading-relaxed">
                  {template.introText}
                </p>

                {/* Interview details card */}
                <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Calendar className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide">
                        When
                      </p>
                      <p className="text-sm text-blue-800 mt-0.5">
                        {interviewDate || "Not scheduled yet"}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-blue-100" />
                  <div className="flex items-start gap-3">
                    <Link2 className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide">
                        Interview Link
                      </p>
                      <a
                        href={interviewUrl}
                        className="text-sm text-blue-600 underline break-all mt-0.5 block"
                      >
                        {interviewUrl || "Interview link will be included in email"}
                      </a>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-gray-500 leading-relaxed">
                  {joiningFlexibility === "anytime"
                    ? "You may take the interview at the scheduled time or at a time that works best for you. Simply click the link whenever you're ready."
                    : "Please join the interview at the scheduled time. Click the link above at the specified date and time to begin."}
                </p>

                {/* Extra content */}
                {(template.extraHeading || template.extraBody) && (
                  <div className="border-t border-gray-100 pt-3 space-y-1">
                    {template.extraHeading && (
                      <h4 className="text-sm font-semibold text-gray-800">
                        {template.extraHeading}
                      </h4>
                    )}
                    {template.extraBody && (
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {template.extraBody}
                      </p>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3 justify-center pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-1.5 px-5 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-medium border border-green-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Accept
                  </div>
                  <div className="flex items-center gap-1.5 px-5 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium border border-red-200">
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </div>
                </div>
              </div>

              {/* Email footer */}
              <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 text-center">
                <p className="text-[10px] text-gray-400">
                  This is an automated email from the recruitment system
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-gray-100 bg-white flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-500 gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 px-5"
          >
            <Save className="w-3.5 h-3.5" />
            Save Template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
