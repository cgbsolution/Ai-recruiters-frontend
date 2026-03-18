"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Upload, X, CheckCircle, ArrowLeft, LogIn, UserPlus } from "lucide-react";
import type { PreInterviewField } from "@/hooks/interview/useInterviewSession";
import { apiUpload } from "@/lib/api";

interface Props {
  preInterviewFields: PreInterviewField[];
  jobId: number;
  isExistingUser?: boolean;
  onRegister: (
    name: string,
    email: string,
    phone: string,
    resumePath: string,
    extraFields: Record<string, string>
  ) => Promise<true | false | null>; // true=ok, false=error, null=already_completed
  onSwitchToLogin: () => void;
  onBack: () => void;
}

// Default field IDs/types that are always rendered explicitly — skip them in dynamic section
const DEFAULT_FIELD_IDS = new Set([
  "name", "full_name", "full-name", "fullname",
  "email", "email_address", "emailaddress", "email-address", "email_id",
  "phone", "phone_number", "phonenumber", "phone-number", "mobile", "mobile_number",
]);
// Also filter by label — catches cases where field_id is custom but label duplicates a default
const DEFAULT_LABELS = new Set([
  "name", "full name", "your name",
  "email", "email address", "email id", "your email",
  "phone", "phone number", "mobile", "mobile number", "contact number",
]);

export default function RegistrationStep({ preInterviewFields, jobId, onRegister, isExistingUser, onSwitchToLogin, onBack }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePath, setResumePath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  // Only render custom fields not covered by the hardcoded defaults (by ID, label, or type)
  const customFields = preInterviewFields.filter(
    (f) =>
      !DEFAULT_FIELD_IDS.has(f.field_id.toLowerCase()) &&
      !DEFAULT_LABELS.has(f.label.toLowerCase()) &&
      f.type !== "email"
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.type)) {
      setErrors((p) => ({ ...p, resume: "Only PDF or DOCX files are accepted" }));
      return;
    }

    setResumeFile(file);
    setErrors((p) => { const n = { ...p }; delete n.resume; return n; });
    setUploading(true);

    const form = new FormData();
    form.append("files", file);
    form.append("job_id", String(jobId));

    try {
      const data = await apiUpload<any[]>("/candidates/upload-resume", form);
      setResumePath(data?.[0]?.resume_path ?? "");
    } catch {
      setErrors((p) => ({ ...p, resume: "Upload failed — please check your connection." }));
      setResumeFile(null);
    } finally {
      setUploading(false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Full name is required";
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = "Valid email is required";
    if (phone.trim()) {
      const digits = phone.replace(/[\s\-\+\(\)]/g, "");
      if (!/^\d{7,15}$/.test(digits)) e.phone = "Enter a valid phone number (digits only, 7–15 characters)";
    }
    if (!resumePath) e.resume = "Resume is required — upload a PDF or DOCX file to continue";
    // Validate dynamic custom fields that are required (date fields must have value)
    for (const field of customFields) {
      const val = extraFields[field.field_id] ?? "";
      if (field.type === "date" && !val) {
        e[field.field_id] = `${field.label} is required`;
      }
    }
    return e;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    const result = await onRegister(name, email, phone, resumePath, extraFields);
    if (result === null) {
      setErrors({ submit: "You have already completed your interview for this position. Please contact HR for further steps." });
    } else if (!result) {
      setErrors({ submit: "Registration failed. Please try again." });
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-10">
      <div className="w-full max-w-md">
        {/* Go Back */}
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm mb-6 transition-colors px-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </Button>

        {/* Continue / New toggle */}
        <div className="bg-gray-900 rounded-xl p-4 mb-8 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 rounded-lg bg-blue-600/20 border border-blue-500/40 p-3">
              <div className="flex items-center gap-2 mb-1">
                <UserPlus className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-blue-300">New Interview</span>
              </div>
              <p className="text-xs text-gray-400">Fill in the form below to start</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={onSwitchToLogin}
              className="flex-1 rounded-lg border border-gray-700 hover:border-gray-500 p-3 h-auto text-left transition-colors"
            >
              <div className="w-full">
                <div className="flex items-center gap-2 mb-1">
                  <LogIn className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-300">Continue Existing</span>
                </div>
                <p className="text-xs text-gray-500">Resume where you left off</p>
              </div>
            </Button>
          </div>
        </div>

        <h2 className="text-3xl font-bold text-white mb-2 text-center">Tell Us About You</h2>
        <p className="text-gray-400 text-center mb-8">Enter your details to begin the interview</p>

        {isExistingUser && (
          <div className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 mb-2">
            <span className="mt-0.5 text-yellow-400 text-base">⚠</span>
            <p className="text-yellow-300 text-sm leading-snug">
              <span className="font-semibold">Candidate already exists for this job.</span>{" "}
              Updating your existing record — no duplicate will be created.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Name */}
          <div>
            <Label className="text-gray-300">Full Name <span className="text-red-400">*</span></Label>
            <Input
              className="mt-1 bg-gray-900 border-gray-700 text-white placeholder-gray-500"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <Label className="text-gray-300">Email Address <span className="text-red-400">*</span></Label>
            <Input
              type="email"
              className="mt-1 bg-gray-900 border-gray-700 text-white placeholder-gray-500"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
          </div>

          {/* Phone */}
          <div>
            <Label className="text-gray-300">Phone</Label>
            <Input
              type="tel"
              inputMode="numeric"
              className="mt-1 bg-gray-900 border-gray-700 text-white placeholder-gray-500"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => {
                // Allow only digits, spaces, +, -, (, )
                const val = e.target.value.replace(/[^0-9\s\+\-\(\)]/g, "");
                setPhone(val);
              }}
            />
            {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
          </div>

          {/* Dynamic custom fields from job config */}
          {customFields.map((field) => (
            <div key={field.field_id}>
              <Label className="text-gray-300">{field.label}</Label>
              {field.type === "textarea" ? (
                <Textarea
                  className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 resize-none"
                  rows={3}
                  placeholder={field.label}
                  value={extraFields[field.field_id] ?? ""}
                  onChange={(e) =>
                    setExtraFields((prev) => ({ ...prev, [field.field_id]: e.target.value }))
                  }
                />
              ) : field.type === "checkbox" ? (
                <div className="flex items-center gap-2 mt-2">
                  <Checkbox
                    id={`field-${field.field_id}`}
                    checked={extraFields[field.field_id] === "true"}
                    onCheckedChange={(checked) =>
                      setExtraFields((prev) => ({
                        ...prev,
                        [field.field_id]: checked === true ? "true" : "false",
                      }))
                    }
                  />
                  <Label htmlFor={`field-${field.field_id}`} className="text-gray-300 text-sm cursor-pointer">{field.label}</Label>
                </div>
              ) : field.type === "date" ? (
                <Input
                  type="date"
                  className="mt-1 bg-gray-900 border-gray-700 text-white placeholder-gray-500"
                  value={extraFields[field.field_id] ?? ""}
                  onChange={(e) =>
                    setExtraFields((prev) => ({ ...prev, [field.field_id]: e.target.value }))
                  }
                />
              ) : field.type === "phone" ? (
                <Input
                  type="tel"
                  inputMode="numeric"
                  className="mt-1 bg-gray-900 border-gray-700 text-white placeholder-gray-500"
                  placeholder={field.label}
                  value={extraFields[field.field_id] ?? ""}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9\s\+\-\(\)]/g, "");
                    setExtraFields((prev) => ({ ...prev, [field.field_id]: val }));
                  }}
                />
              ) : (
                <Input
                  type={field.type === "email" ? "email" : "text"}
                  className="mt-1 bg-gray-900 border-gray-700 text-white placeholder-gray-500"
                  placeholder={field.label}
                  value={extraFields[field.field_id] ?? ""}
                  onChange={(e) =>
                    setExtraFields((prev) => ({ ...prev, [field.field_id]: e.target.value }))
                  }
                />
              )}
              {errors[field.field_id] && <p className="text-red-400 text-xs mt-1">{errors[field.field_id]}</p>}
            </div>
          ))}

          {/* Resume — MANDATORY */}
          <div>
            <Label className="text-gray-300">
              Resume (PDF / DOCX) <span className="text-red-400">*</span>
            </Label>
            <p className="text-xs text-gray-500 mb-1">
              Required to continue. Your resume will be used to personalise the interview.
            </p>
            <div
              className={`border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors ${
                errors.resume
                  ? "border-red-500"
                  : resumePath
                  ? "border-green-500 bg-green-900/10"
                  : "border-gray-700 hover:border-blue-500"
              }`}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <div className="flex flex-col items-center text-blue-400 text-sm gap-2">
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span>Uploading…</span>
                </div>
              ) : resumeFile && resumePath ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-green-400 truncate max-w-[240px]">
                      {resumeFile.name}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setResumeFile(null);
                      setResumePath("");
                    }}
                    className="h-6 w-6"
                  >
                    <X className="w-4 h-4 text-gray-400 hover:text-white" />
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center text-gray-500 text-sm gap-1">
                  <Upload className="w-6 h-6" />
                  <span>Click to upload your resume</span>
                  <span className="text-xs text-gray-600">PDF or DOCX · max 10 MB</span>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={handleFileChange}
            />
            {errors.resume && <p className="text-red-400 text-xs mt-1">{errors.resume}</p>}
          </div>

          {errors.submit && (
            <p className="text-red-400 text-sm text-center">{errors.submit}</p>
          )}

          <Button
            type="submit"
            disabled={loading || uploading}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
          >
            {loading ? "Registering…" : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
