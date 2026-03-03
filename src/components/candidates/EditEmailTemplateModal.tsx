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
  onSave,
}: EditEmailTemplateModalProps) {
  const [template, setTemplate] = useState<EmailTemplateData>({
    subject: initial?.subject || `Your Interview Schedule for ${jobTitle}`,
    introText: initial?.introText || `You are shortlisted for an AI Interview round for the role ${jobTitle} at company CGBiz Solutions Private limited`,
    extraHeading: initial?.extraHeading || "",
    extraBody: initial?.extraBody || "",
    ccEmails: initial?.ccEmails || "",
  });

  const handleChange = (key: keyof EmailTemplateData, value: string) => {
    setTemplate((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[90vh] overflow-y-auto p-0">
        <div className="grid grid-cols-2 h-full">
          {/* Left: Edit */}
          <div className="p-6 border-r border-gray-200 space-y-4 overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Template</DialogTitle>
            </DialogHeader>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setTemplate({
                subject: `Your Interview Schedule for ${jobTitle}`,
                introText: `You are shortlisted for an AI Interview round for the role ${jobTitle} at company CGBiz Solutions Private limited`,
                extraHeading: "",
                extraBody: "",
                ccEmails: "",
              })}>
                Get Default Template
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel Changes
              </Button>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Email Subject (this will not appear in the preview)</Label>
              <Input
                value={template.subject}
                onChange={(e) => handleChange("subject", e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Introductory Text</Label>
              <Textarea
                rows={3}
                value={template.introText}
                onChange={(e) => handleChange("introText", e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Input
                placeholder="Enter extra text heading"
                value={template.extraHeading}
                onChange={(e) => handleChange("extraHeading", e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Textarea
                rows={3}
                placeholder="Add extra text here"
                value={template.extraBody}
                onChange={(e) => handleChange("extraBody", e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-500">CC Emails (comma-separated)</Label>
              <Input
                placeholder="email1@example.com, email2@example.com"
                value={template.ccEmails}
                onChange={(e) => handleChange("ccEmails", e.target.value)}
              />
            </div>
          </div>

          {/* Right: Preview */}
          <div className="p-6 bg-gray-50 overflow-y-auto">
            <h3 className="font-semibold text-center mb-4 text-gray-700">Template Preview</h3>
            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4 text-sm">
              <div className="flex justify-center">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">z</div>
              </div>
              <h2 className="text-xl font-bold text-gray-800">Your Interview has been scheduled</h2>
              <p className="text-gray-600">Hello {candidateName},</p>
              <p className="text-gray-600">{template.introText}</p>
              <div className="border-t pt-3">
                <p className="font-semibold text-gray-700">When is the interview?</p>
                <p className="text-gray-600">{interviewDate}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700">Interview URL</p>
                <a href={interviewUrl} className="text-blue-600 underline text-xs break-all">{interviewUrl || "https://app.zinterview.ai/interview/..."}</a>
              </div>
              <p className="text-gray-500 text-xs">
                You may take the interview at the scheduled time or at a time that works best for you.
                Simply click the link whenever you're ready.
              </p>
              {template.extraHeading && (
                <h3 className="font-semibold text-gray-700">{template.extraHeading}</h3>
              )}
              {template.extraBody && (
                <p className="text-gray-600">{template.extraBody}</p>
              )}
              <div className="flex gap-3 justify-center pt-4 border-t">
                <div className="px-6 py-2 bg-blue-100 text-blue-700 rounded text-sm font-medium">✓ Accept</div>
                <div className="px-6 py-2 bg-red-50 text-red-600 rounded text-sm font-medium">✕ Reject</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t bg-white">
          <Button onClick={() => { onSave(template); onClose(); }} className="bg-green-600 hover:bg-green-700">
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
