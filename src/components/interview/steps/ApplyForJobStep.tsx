"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Briefcase,
  CheckCircle,
  FileText,
  Loader2,
  Mail,
  Phone,
  Upload,
  User,
} from "lucide-react";
import { apiUpload } from "@/lib/api";

interface Props {
  token: string;
  email: string;
  prefillName?: string;
  jobTitle: string;
  onApply: (
    name: string,
    email: string,
    phone: string | undefined,
    resumePath: string
  ) => Promise<{ success: boolean; message: string }>;
  onBack: () => void;
}

export default function ApplyForJobStep({
  token,
  email: initialEmail,
  prefillName,
  jobTitle,
  onApply,
  onBack,
}: Props) {
  const [name, setName] = useState(prefillName || "");
  const [email] = useState(initialEmail);
  const [phone, setPhone] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePath, setResumePath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [resultMessage, setResultMessage] = useState("");

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["pdf", "doc", "docx"].includes(ext || "")) {
        setErrors((p) => ({ ...p, resume: "Only PDF, DOC, or DOCX files are accepted." }));
        return;
      }

      setResumeFile(file);
      setErrors((p) => {
        const n = { ...p };
        delete n.resume;
        return n;
      });
      setUploading(true);

      const form = new FormData();
      form.append("file", file);

      try {
        const data = await apiUpload<{ resume_path: string }>(`/interview/${token}/upload-resume`, form);
        setResumePath(data?.resume_path ?? "");
      } catch {
        setErrors((p) => ({
          ...p,
          resume: "Upload failed. Please try again.",
        }));
        setResumeFile(null);
      } finally {
        setUploading(false);
      }
    },
    []
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Full name is required";
    if (!resumePath) e.resume = "Resume is required";
    if (phone.trim()) {
      const digits = phone.replace(/[\s\-\+\(\)]/g, "");
      if (!/^\d{7,15}$/.test(digits)) e.phone = "Enter a valid phone number";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    const result = await onApply(
      name.trim(),
      email,
      phone.trim() || undefined,
      resumePath
    );
    setSubmitting(false);

    if (result.success) {
      setSubmitted(true);
      setResultMessage(result.message);
    } else {
      setErrors({ form: result.message });
    }
  };

  // Success state
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 py-10 bg-white">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 rounded-full bg-green-50 border border-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Application Submitted
          </h2>
          <p className="text-gray-500 mb-6">{resultMessage}</p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left">
            <p className="text-sm text-gray-500 mb-1">What happens next?</p>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>1. Your resume will be reviewed by the recruiter</li>
              <li>2. If shortlisted, you&apos;ll receive an interview invitation via email</li>
              <li>3. Use the link in the invitation email to start your AI interview</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-10 bg-white">
      <div className="w-full max-w-md">
        {/* Go Back */}
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm mb-6 transition-colors px-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </Button>

        {/* Header */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center">
            <Briefcase className="w-8 h-8 text-purple-500" />
          </div>
        </div>

        <h2 className="text-3xl font-bold text-gray-900 mb-2 text-center">
          Apply for this Job
        </h2>
        <p className="text-gray-500 text-center mb-2">
          <span className="text-blue-600 font-medium">{jobTitle}</span>
        </p>
        <p className="text-gray-400 text-sm text-center mb-8">
          Upload your resume and we&apos;ll notify you if you&apos;re selected for an interview.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <Label className="text-gray-700 text-sm font-medium">
              Full Name <span className="text-red-500">*</span>
            </Label>
            <div className="relative mt-1.5">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-12 pl-10 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 rounded-xl focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            {errors.name && (
              <p className="text-red-500 text-xs mt-1">{errors.name}</p>
            )}
          </div>

          {/* Email (read-only) */}
          <div>
            <Label className="text-gray-700 text-sm font-medium">Email Address</Label>
            <div className="relative mt-1.5">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="email"
                value={email}
                disabled
                className="h-12 pl-10 bg-gray-100 border-gray-300 text-gray-500 rounded-xl"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <Label className="text-gray-700 text-sm font-medium">Phone Number</Label>
            <div className="relative mt-1.5">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="tel"
                placeholder="Optional"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-12 pl-10 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 rounded-xl focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            {errors.phone && (
              <p className="text-red-500 text-xs mt-1">{errors.phone}</p>
            )}
          </div>

          {/* Resume Upload */}
          <div>
            <Label className="text-gray-700 text-sm font-medium">
              Resume <span className="text-red-500">*</span>
            </Label>
            <div className="mt-1.5">
              {resumeFile ? (
                <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
                  <span className="text-sm text-gray-700 truncate flex-1">
                    {resumeFile.name}
                  </span>
                  {uploading ? (
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  ) : resumePath ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : null}
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl px-4 py-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
                  <Upload className="w-6 h-6 text-gray-400" />
                  <span className="text-sm text-gray-500">
                    Click to upload your resume
                  </span>
                  <span className="text-xs text-gray-400">
                    PDF, DOC, or DOCX
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            {errors.resume && (
              <p className="text-red-500 text-xs mt-1">{errors.resume}</p>
            )}
          </div>

          {/* Form-level error */}
          {errors.form && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-red-600 text-sm">{errors.form}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting || uploading || !resumePath}
            className="w-full h-12 bg-purple-600 hover:bg-purple-500 text-white font-semibold disabled:opacity-50 rounded-xl shadow-md shadow-purple-200"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting...
              </>
            ) : (
              "Submit Application"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
