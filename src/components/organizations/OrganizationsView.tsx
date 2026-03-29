"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Eye, Pencil, Trash2, Power, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Organization {
  id: number;
  name: string;
  domain: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  user_count: number;
  job_count: number;
  max_jobs: number;
  max_candidates_per_job: number;
  total_jobs_used: number;
  total_candidates_used: number;
  allow_resume_database: boolean;
}

interface OrgStats {
  total_organizations: number;
  active_organizations: number;
  total_users: number;
  total_jobs: number;
  total_candidates: number;
  users_by_role: Record<string, number>;
}

export default function OrganizationsView() {
  const { hasRole } = useAuth();
  const router = useRouter();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [formName, setFormName] = useState("");
  const [formDomain, setFormDomain] = useState("");
  const [formMaxJobs, setFormMaxJobs] = useState(0);
  const [formMaxCandidates, setFormMaxCandidates] = useState(0);
  const [formAllowResumeDb, setFormAllowResumeDb] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchOrgs = useCallback(async () => {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const data = await api<Organization[]>(`/organizations/${params}`);
      setOrgs(data);
    } catch {
      // silently fail
    }
  }, [search]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api<OrgStats>("/organizations/stats/overview");
      setStats(data);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchOrgs(), fetchStats()]).finally(() => setLoading(false));
  }, [fetchOrgs, fetchStats]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        domain: formDomain.trim().toLowerCase(),
        max_jobs: formMaxJobs,
        max_candidates_per_job: formMaxCandidates,
        allow_resume_database: formAllowResumeDb,
      };

      if (editOrg) {
        await api(`/organizations/${editOrg.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Organization updated successfully");
      } else {
        await api("/organizations/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Organization created successfully");
      }

      setDialogOpen(false);
      setEditOrg(null);
      resetForm();
      await fetchOrgs();
      await fetchStats();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to save organization");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (org: Organization) => {
    try {
      await api(`/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !org.is_active }),
      });
      toast.success(
        org.is_active
          ? `"${org.name}" deactivated successfully`
          : `"${org.name}" activated successfully`
      );
      await fetchOrgs();
      await fetchStats();
    } catch {
      toast.error("Failed to update organization status");
    }
  };

  const handleResetUsage = async (org: Organization) => {
    if (!confirm(`Reset usage counters for "${org.name}"? This will allow them to create jobs/candidates again.`)) return;
    try {
      await api(`/organizations/${org.id}/reset-usage`, { method: "POST" });
      toast.success(`Usage counters reset for "${org.name}"`);
      await fetchOrgs();
    } catch {
      toast.error("Failed to reset usage counters");
    }
  };

  const handleDelete = async (org: Organization) => {
    if (!confirm(`Delete "${org.name}"? This will unlink all users from this organization.`)) return;
    try {
      await api(`/organizations/${org.id}`, { method: "DELETE" });
      toast.success(`"${org.name}" deleted successfully`);
      await fetchOrgs();
      await fetchStats();
    } catch {
      toast.error("Failed to delete organization");
    }
  };

  const openCreate = () => {
    setEditOrg(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (org: Organization) => {
    setEditOrg(org);
    setFormName(org.name);
    setFormDomain(org.domain);
    setFormMaxJobs(org.max_jobs ?? 0);
    setFormMaxCandidates(org.max_candidates_per_job ?? 0);
    setFormAllowResumeDb(org.allow_resume_database ?? false);
    setFormError("");
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormName("");
    setFormDomain("");
    setFormMaxJobs(0);
    setFormMaxCandidates(0);
    setFormAllowResumeDb(false);
    setFormError("");
  };

  if (!hasRole("super_admin")) {
    return (
      <div className="text-center py-20 text-gray-500">
        You do not have permission to access this page.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Organizations</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage organizations and domain whitelisting
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />
          Add Organization
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Orgs", value: stats.total_organizations },
            { label: "Active Orgs", value: stats.active_organizations },
            { label: "Total Users", value: stats.total_users },
            { label: "Total Jobs", value: stats.total_jobs },
            { label: "Total Candidates", value: stats.total_candidates },
          ].map((stat) => (
            <Card key={stat.label} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="max-w-md">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or domain..."
        />
      </div>

      {/* Organizations Table */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-700/50">
              <TableHead className="px-6">Organization</TableHead>
              <TableHead className="px-6">Domain</TableHead>
              <TableHead className="px-6 text-center">Users</TableHead>
              <TableHead className="px-6 text-center">Jobs</TableHead>
              <TableHead className="px-6 text-center">Job Limit</TableHead>
              <TableHead className="px-6 text-center">Candidate Limit</TableHead>
              <TableHead className="px-6 text-center">Status</TableHead>
              <TableHead className="px-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-gray-500 dark:text-gray-400">
                  No organizations found. Click &quot;Add Organization&quot; to create one.
                </TableCell>
              </TableRow>
            ) : (
              orgs.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="px-6">
                    <p className="font-medium text-gray-900 dark:text-white">{org.name}</p>
                  </TableCell>
                  <TableCell className="px-6">
                    <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-0">
                      @{org.domain}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-6 text-center text-gray-700 dark:text-gray-300">{org.user_count}</TableCell>
                  <TableCell className="px-6 text-center text-gray-700 dark:text-gray-300">{org.job_count}</TableCell>
                  <TableCell className="px-6 text-center text-xs">
                    {(org.max_jobs ?? 0) === 0 ? (
                      <Badge variant="secondary" className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-0">
                        Unlimited
                      </Badge>
                    ) : (
                      <span className={`font-medium ${(org.total_jobs_used || 0) >= org.max_jobs ? "text-red-500" : "text-gray-500 dark:text-gray-400"}`}>
                        {org.total_jobs_used || 0} / {org.max_jobs}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-6 text-center text-xs">
                    {(org.max_candidates_per_job ?? 0) === 0 ? (
                      <Badge variant="secondary" className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-0">
                        Unlimited
                      </Badge>
                    ) : (
                      <span className={`font-medium ${(org.total_candidates_used || 0) >= org.max_candidates_per_job ? "text-red-500" : "text-gray-500 dark:text-gray-400"}`}>
                        {org.total_candidates_used || 0} / {org.max_candidates_per_job}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-6 text-center">
                    <Badge
                      variant="secondary"
                      className={`border-0 ${
                        org.is_active
                          ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                          : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                      }`}
                    >
                      {org.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-6 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="View dashboard"
                        onClick={() => router.push(`/organizations/${org.id}`)}
                        className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit organization"
                        onClick={() => openEdit(org)}
                        className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={org.is_active ? "Deactivate organization" : "Activate organization"}
                        onClick={() => handleToggleActive(org)}
                        className={`h-8 w-8 ${
                          org.is_active
                            ? "text-yellow-500 hover:text-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-900/30"
                            : "text-green-500 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/30"
                        }`}
                      >
                        <Power className="w-4 h-4" />
                      </Button>
                      {((org.max_jobs ?? 0) > 0 || (org.max_candidates_per_job ?? 0) > 0) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Reset usage counters"
                          onClick={() => handleResetUsage(org)}
                          className="h-8 w-8 text-purple-500 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/30"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete organization"
                        onClick={() => handleDelete(org)}
                        className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create / Edit Organization Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setEditOrg(null);
          resetForm();
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editOrg ? "Edit Organization" : "Add New Organization"}
            </DialogTitle>
            <DialogDescription>
              {editOrg
                ? "Update the organization details below."
                : "Fill in the details to create a new organization."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Email Domain</Label>
                <Input
                  value={formDomain}
                  onChange={(e) => setFormDomain(e.target.value)}
                  placeholder="e.g. acme.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Max Jobs{" "}
                  <span className="text-xs text-gray-400 font-normal">(0 = unlimited)</span>
                </Label>
                <Input
                  type="number"
                  value={formMaxJobs}
                  onChange={(e) => setFormMaxJobs(parseInt(e.target.value) || 0)}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Max Candidates per Job{" "}
                  <span className="text-xs text-gray-400 font-normal">(0 = unlimited)</span>
                </Label>
                <Input
                  type="number"
                  value={formMaxCandidates}
                  onChange={(e) => setFormMaxCandidates(parseInt(e.target.value) || 0)}
                  min={0}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="allowResumeDb"
                checked={formAllowResumeDb}
                onChange={(e) => setFormAllowResumeDb(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Label htmlFor="allowResumeDb" className="cursor-pointer">
                Allow Resume Database Access
              </Label>
            </div>

            {formError && (
              <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editOrg ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
