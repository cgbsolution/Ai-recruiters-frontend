"use client";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { notifySuccess, notifyError } from "@/lib/notify";
import { api } from "@/lib/api";

interface ResumeItem {
  id: number;
  candidate_email: string;
  candidate_name: string | null;
  phone: string | null;
  current_designation: string | null;
  experience_years: number | null;
  skills: string[];
  location: string | null;
  annual_package: number | null;
  expected_ctc?: number | null;
  notice_period_days?: number | null;
  open_to_relocate?: boolean | null;
}

// Values a recruiter learns on a call; saving one marks it "Recruiter" (not
// "From CV") on the profile.
const NOTICE_OPTIONS = [
  { value: "", label: "Not stated" },
  { value: "0", label: "Immediate" },
  { value: "15", label: "15 days" },
  { value: "30", label: "30 days" },
  { value: "45", label: "45 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
];

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring dark:bg-input/30";

interface EditResumeModalProps {
  open: boolean;
  onClose: () => void;
  resume: ResumeItem | null;
  onUpdated: (updated: ResumeItem) => void;
}

export default function EditResumeModal({ open, onClose, resume, onUpdated }: EditResumeModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [designation, setDesignation] = useState("");
  const [experience, setExperience] = useState("");
  const [skills, setSkills] = useState("");
  const [location, setLocation] = useState("");
  const [annualPackage, setAnnualPackage] = useState("");
  const [expectedCtc, setExpectedCtc] = useState("");
  const [notice, setNotice] = useState("");
  const [relocate, setRelocate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (resume) {
      setName(resume.candidate_name || "");
      setPhone(resume.phone || "");
      setDesignation(resume.current_designation || "");
      setExperience(resume.experience_years != null ? String(resume.experience_years) : "");
      setSkills((resume.skills || []).join(", "));
      setLocation(resume.location || "");
      setAnnualPackage(resume.annual_package != null ? String(resume.annual_package) : "");
      setExpectedCtc(resume.expected_ctc != null ? String(resume.expected_ctc) : "");
      setNotice(resume.notice_period_days != null ? String(resume.notice_period_days) : "");
      setRelocate(resume.open_to_relocate == null ? "" : resume.open_to_relocate ? "yes" : "no");
    }
  }, [resume]);

  const handleSave = async () => {
    if (!resume) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (name !== (resume.candidate_name || "")) body.candidate_name = name || null;
      if (phone !== (resume.phone || "")) body.phone = phone || null;
      if (designation !== (resume.current_designation || "")) body.current_designation = designation || null;

      const expNum = experience ? parseFloat(experience) : null;
      if (expNum !== resume.experience_years) body.experience_years = expNum;

      const skillsArr = skills.split(",").map((s) => s.trim()).filter(Boolean);
      const oldSkills = (resume.skills || []).join(", ");
      if (skills !== oldSkills) body.skills = skillsArr;

      if (location !== (resume.location || "")) body.location = location || null;

      const pkgNum = annualPackage ? parseFloat(annualPackage) : null;
      if (pkgNum !== resume.annual_package) body.annual_package = pkgNum;

      const expectedNum = expectedCtc ? parseFloat(expectedCtc) : null;
      if (expectedNum !== (resume.expected_ctc ?? null)) body.expected_ctc = expectedNum;

      const noticeNum = notice !== "" ? parseInt(notice, 10) : null;
      if (noticeNum !== (resume.notice_period_days ?? null)) body.notice_period_days = noticeNum;

      const relocateVal = relocate === "" ? null : relocate === "yes";
      if (relocateVal !== (resume.open_to_relocate ?? null)) body.open_to_relocate = relocateVal;

      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }

      // api() attaches the Bearer token — the resume-database router requires it.
      const data = await api<ResumeItem>(`/resume-database/${resume.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      notifySuccess("Resume updated");
      onUpdated(data);
      onClose();
    } catch (err: any) {
      notifyError(err.message || "Failed to update resume");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Resume Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Candidate name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-designation">Designation</Label>
              <Input id="edit-designation" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Current designation" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-experience">Experience (years)</Label>
              <Input id="edit-experience" type="number" step="0.5" min="0" value={experience} onChange={(e) => setExperience(e.target.value)} placeholder="e.g. 2.5" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-location">Location</Label>
              <Input id="edit-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-package">Current CTC (LPA)</Label>
              <Input id="edit-package" type="number" step="0.1" min="0" value={annualPackage} onChange={(e) => setAnnualPackage(e.target.value)} placeholder="e.g. 8.5" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-expected">Expected CTC (LPA)</Label>
              <Input id="edit-expected" type="number" step="0.1" min="0" value={expectedCtc} onChange={(e) => setExpectedCtc(e.target.value)} placeholder="e.g. 12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-notice">Notice period</Label>
              <select id="edit-notice" value={notice} onChange={(e) => setNotice(e.target.value)} className={selectClass}>
                {/* Keep an unusual stored value selectable */}
                {notice !== "" && !NOTICE_OPTIONS.some((o) => o.value === notice) && (
                  <option value={notice}>{notice} days</option>
                )}
                {NOTICE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-relocate">Relocation</Label>
              <select id="edit-relocate" value={relocate} onChange={(e) => setRelocate(e.target.value)} className={selectClass}>
                <option value="">Not stated</option>
                <option value="yes">Open to relocate</option>
                <option value="no">Not open</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-skills">Skills (comma-separated)</Label>
            <Input id="edit-skills" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Python, React, SQL..." />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
