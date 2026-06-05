"use client";
import React, { useEffect, useState } from "react";
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
import { api } from "@/lib/api";
import { isPlaceholderEmail } from "@/lib/candidateEmail";

interface EditableCandidate {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
}

interface EditCandidateModalProps {
  open: boolean;
  onClose: () => void;
  candidate: EditableCandidate | null;
  onUpdated: (candidate: any) => void;
}

const COUNTRIES = ["India", "USA", "UK", "Canada", "Australia", "Germany", "Singapore", "UAE"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EditCandidateModal({
  open,
  onClose,
  candidate,
  onUpdated,
}: EditCandidateModalProps) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", country: "India" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Re-seed the form whenever a different candidate is opened. A synthetic
  // placeholder email is treated as empty so the recruiter fills in a real one.
  useEffect(() => {
    if (!candidate) return;
    setForm({
      name: candidate.name || "",
      email: isPlaceholderEmail(candidate.email) ? "" : candidate.email,
      phone: candidate.phone || "",
      country: candidate.location || "India",
    });
    setError("");
  }, [candidate]);

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate) return;
    setError("");

    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!form.email.trim() || !EMAIL_RE.test(form.email.trim())) {
      setError("A valid email address is required.");
      return;
    }

    setLoading(true);
    try {
      const updated = await api<any>(`/candidates/${candidate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          location: form.country,
        }),
      });
      onUpdated(updated);
      notifySuccess("Candidate updated.");
      onClose();
    } catch (err: any) {
      notifyError(err?.message || "Failed to update candidate");
      setError(err?.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Edit Candidate</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}

          <div className="space-y-1">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-email">Email Address</Label>
            <Input
              id="edit-email"
              type="email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="name@example.com"
              required
            />
            {candidate && isPlaceholderEmail(candidate.email) && (
              <p className="text-xs text-amber-600">
                This candidate has no email yet — add one to enable scheduling.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-phone">Phone Number</Label>
            <Input
              id="edit-phone"
              value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Country</Label>
            <Select value={form.country} onValueChange={(val) => handleChange("country", val)}>
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
