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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notifySuccess, notifyError } from "@/lib/notify";

interface AddCandidateModalProps {
  open: boolean;
  onClose: () => void;
  jobId: number;
  onCreated: (candidate: any) => void;
}

const COUNTRIES = ["India", "USA", "UK", "Canada", "Australia", "Germany", "Singapore", "UAE"];

export default function AddCandidateModal({
  open,
  onClose,
  jobId,
  onCreated,
}: AddCandidateModalProps) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    preferredName: "",
    email: "",
    experienceYears: "",
    country: "India",
    phone: "",
    resume: null as File | null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.firstName || !form.email) {
      setError("First Name and Email are required.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: [form.firstName, form.lastName].filter(Boolean).join(" "),
        email: form.email,
        phone: form.phone,
        location: form.country,
        role: "",
        job_id: jobId,
        status: "Applied",
      };

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/candidates/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to create candidate");
      const data = await res.json();
      onCreated(data);
      notifySuccess("Candidate added successfully!");
      onClose();
      setForm({
        firstName: "", lastName: "", preferredName: "", email: "",
        experienceYears: "", country: "India", phone: "", resume: null,
      });
    } catch (err: any) {
      notifyError(err.message || "Failed to add candidate");
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Add Candidate</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => handleChange("firstName", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => handleChange("lastName", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="preferredName">Preferred Name</Label>
            <Input
              id="preferredName"
              value={form.preferredName}
              onChange={(e) => handleChange("preferredName", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="experience">Experience in Years</Label>
            <Input
              id="experience"
              type="number"
              min="0"
              step="0.5"
              value={form.experienceYears}
              onChange={(e) => handleChange("experienceYears", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Country</Label>
            <Select
              value={form.country}
              onValueChange={(val) => handleChange("country", val)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="resume">Upload Resume</Label>
            <Input
              id="resume"
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setForm((prev) => ({ ...prev, resume: e.target.files?.[0] ?? null }))}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
