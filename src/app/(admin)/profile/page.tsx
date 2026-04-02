"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { notifySuccess, notifyError } from "@/lib/notify";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Video, Unlink } from "lucide-react";

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    designation: "",
  });
  const [saving, setSaving] = useState(false);
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [googleDisconnecting, setGoogleDisconnecting] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(true);

  // Listen for Google OAuth popup callback
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "google-connected") {
        // Refresh user data from backend
        setGoogleConnecting(false);
        api<any>("/auth/me").then((data) => {
          updateUser({
            google_connected: data.google_connected ?? false,
            google_email: data.google_email ?? null,
          });
          notifySuccess("Google account connected successfully!");
        }).catch(() => {});
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [updateUser]);

  // Check if Google OAuth is configured on the server
  useEffect(() => {
    api<{ url: string }>("/auth/google/connect").catch((err: any) => {
      if (err?.status === 501) setGoogleAvailable(false);
    });
  }, []);

  const handleGoogleConnect = useCallback(async () => {
    setGoogleConnecting(true);
    try {
      const data = await api<{ url: string }>("/auth/google/connect");
      const w = 500, h = 600;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      window.open(data.url, "google-oauth", `width=${w},height=${h},left=${left},top=${top}`);
    } catch (err: any) {
      if (err?.status === 501) {
        setGoogleAvailable(false);
      } else {
        notifyError(err?.message || "Failed to start Google connection.");
      }
      setGoogleConnecting(false);
    }
  }, []);

  const handleGoogleDisconnect = useCallback(async () => {
    setGoogleDisconnecting(true);
    try {
      await api("/auth/google/disconnect", { method: "POST" });
      updateUser({ google_connected: false, google_email: null });
      notifySuccess("Google account disconnected.");
    } catch (err: any) {
      notifyError(err?.message || "Failed to disconnect.");
    } finally {
      setGoogleDisconnecting(false);
    }
  }, [updateUser]);

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
      {/* Google Calendar Integration */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03] mt-6">
        {!googleAvailable && !user?.google_connected ? (
          <p className="text-sm text-gray-400 italic">Google Calendar integration is not configured on this server.</p>
        ) : (
        <>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
            <Video className="w-4.5 h-4.5 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Google Calendar
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Connect to create Google Meet links when scheduling interviews
            </p>
          </div>
        </div>

        {user?.google_connected ? (
          <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-800 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">Connected</p>
                <p className="text-xs text-green-600 dark:text-green-400">{user.google_email}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGoogleDisconnect}
              disabled={googleDisconnecting}
              className="text-red-500 hover:text-red-700 hover:bg-red-50 gap-1.5"
            >
              {googleDisconnecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Unlink className="w-3.5 h-3.5" />
              )}
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No Google account connected
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Connect to auto-create Google Meet links for interviews
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleGoogleConnect}
              disabled={googleConnecting}
              className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 gap-2 shadow-sm"
            >
              {googleConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              Connect Google
            </Button>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
