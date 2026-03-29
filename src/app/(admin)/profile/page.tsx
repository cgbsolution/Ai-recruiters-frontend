"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { notifySuccess, notifyError } from "@/lib/notify";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    designation: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || "",
        phone: user.phone || "",
        designation: user.designation || "",
      });
    }
  }, [user]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      notifyError("Full name is required.");
      return;
    }
    setSaving(true);
    try {
      const updated = await api<any>("/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          designation: form.designation.trim(),
        }),
      });
      updateUser({
        name: updated.name,
        phone: updated.phone ?? null,
        designation: updated.designation ?? null,
      });
      notifySuccess("Profile updated successfully.");
    } catch (err: any) {
      notifyError(err?.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const isSuperAdmin = user?.role === "super_admin";
  const isAdminOrRecruiter = user?.role === "admin" || user?.role === "recruiter";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-6">
          Profile
        </h3>

        <div className="space-y-5">
          {/* Avatar initial */}
          <div className="flex items-center gap-4 mb-2">
            <div className="w-16 h-16 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-2xl font-bold text-brand-600 dark:text-brand-400">
              {form.name.charAt(0).toUpperCase() || "?"}
            </div>
            <div>
              <p className="font-medium text-gray-800 dark:text-white">{form.name || "—"}</p>
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-2 py-0.5 rounded-full">
                {user?.role?.replace("_", " ")}
              </span>
            </div>
          </div>

          {/* Common fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-red-500">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Your full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled className="bg-gray-50 text-gray-500" />
              <p className="text-xs text-gray-400">Email cannot be changed</p>
            </div>
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="e.g. +91 9876543210"
                type="tel"
              />
            </div>

            {/* Admin / Recruiter fields */}
            {(isAdminOrRecruiter || isSuperAdmin) && (
              <div className="space-y-1.5">
                <Label>Designation</Label>
                <Input
                  value={form.designation}
                  onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                  placeholder="e.g. HR Manager"
                />
              </div>
            )}
          </div>

          {/* Organization — read-only for non-super-admin */}
          {user?.organization_name && (
            <div className="space-y-1.5">
              <Label>Organization</Label>
              <Input value={user.organization_name} disabled className="bg-gray-50 text-gray-500" />
            </div>
          )}

          {/* Super Admin extra info */}
          {isSuperAdmin && (
            <div className="rounded-lg bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 px-4 py-3">
              <p className="text-sm font-medium text-brand-700 dark:text-brand-300">Super Admin Account</p>
              <p className="text-xs text-brand-500 dark:text-brand-400 mt-0.5">
                You have full access to all organizations and system settings.
              </p>
            </div>
          )}

          <div className="pt-2">
            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving…</>
              ) : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
