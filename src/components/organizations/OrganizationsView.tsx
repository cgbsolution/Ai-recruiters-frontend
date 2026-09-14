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
import { SearchInput } from "@/components/ui/search-input";
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
  /** Opaque id used in the dashboard URL (/organizations/{ref}). */
  ref: string;
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
  allow_code_editor: boolean;
  allow_fit_score: boolean;
}

interface OrgStats {
  total_organizations: number;
  active_organizations: number;
  total_users: number;
  total_jobs: number;
  total_candidates: number;
  users_by_role: Record<string, number>;
}

interface UnassignedCounts {
  jobs: number;
  candidates: number;
  questions: number;
  resumes: number;
  ai_credit_usage: number;
}

interface ClaimPreview {
  data: UnassignedCounts;
  users: { id: number; name: string; email: string; role: string; organization_name: string | null }[];
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
  const [formAllowCodeEditor, setFormAllowCodeEditor] = useState(false);
  const [formAllowFitScore, setFormAllowFitScore] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Unassigned data (organization_id NULL) and the "assign to organization" dialog
  const [unassigned, setUnassigned] = useState<UnassignedCounts | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimOrgRef, setClaimOrgRef] = useState("");
  const [claimPreview, setClaimPreview] = useState<ClaimPreview | null>(null);
  const [claimUserIds, setClaimUserIds] = useState<number[]>([]);
  const [claiming, setClaiming] = useState(false);

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

  const fetchUnassigned = useCallback(async () => {
    try {
      setUnassigned(await api<UnassignedCounts>("/organizations/unassigned/summary"));
    } catch {
      // silently fail — the banner just stays hidden
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchOrgs(), fetchStats(), fetchUnassigned()]).finally(() => setLoading(false));
  }, [fetchOrgs, fetchStats, fetchUnassigned]);

  const selectClaimOrg = async (orgRef: string) => {
    setClaimOrgRef(orgRef);
    setClaimPreview(null);
    setClaimUserIds([]);
    if (!orgRef) return;
    try {
      const preview = await api<ClaimPreview>(`/organizations/${orgRef}/unassigned`);
      setClaimPreview(preview);
      setClaimUserIds(preview.users.map((u) => u.id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load preview");
    }
  };

  const handleClaim = async () => {
    const org = orgs.find((o) => o.ref === claimOrgRef);
    if (!org) return;
    setClaiming(true);
    try {
      const moved = await api<{ jobs: number; questions: number; resumes: number; users: number }>(
        `/organizations/${org.ref}/claim-unassigned`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_ids: claimUserIds }),
        }
      );
      toast.success(
        `Assigned to ${org.name}: ${moved.jobs} jobs, ${moved.questions} questions, ${moved.resumes} resumes, ${moved.users} users`
      );
      setClaimOpen(false);
      await Promise.all([fetchOrgs(), fetchStats(), fetchUnassigned()]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to assign data");
    } finally {
      setClaiming(false);
    }
  };

  const unassignedTotal = unassigned ? unassigned.jobs + unassigned.questions + unassigned.resumes : 0;

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
        allow_code_editor: formAllowCodeEditor,
        allow_fit_score: formAllowFitScore,
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
    setFormAllowCodeEditor(org.allow_code_editor ?? false);
    setFormAllowFitScore(org.allow_fit_score ?? false);
    setFormError("");
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormName("");
    setFormDomain("");
    setFormMaxJobs(0);
    setFormMaxCandidates(0);
    setFormAllowResumeDb(false);
    setFormAllowCodeEditor(false);
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

      {unassigned && unassignedTotal > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
          <p>
            <span className="font-semibold">
              {unassigned.jobs} jobs, {unassigned.candidates} candidates, {unassigned.questions} questions and{" "}
              {unassigned.resumes} resumes
            </span>{" "}
            don&apos;t belong to any organization, so admins and recruiters can&apos;t see them.
          </p>
          <Button
            size="sm"
            onClick={() => {
              setClaimOpen(true);
              selectClaimOrg("");
            }}
          >
            Assign to organization
          </Button>
        </div>
      )}

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
        <SearchInput
          size="sm"
          shortcut="/"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch("")}
          placeholder="Search by name or domain…"
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
                        onClick={() => router.push(`/organizations/${org.ref}`)}
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

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="allowCodeEditor"
                checked={formAllowCodeEditor}
                onChange={(e) => setFormAllowCodeEditor(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Label htmlFor="allowCodeEditor" className="cursor-pointer">
                Allow Code Editor Access
                <span className="ml-2 text-xs text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded">Premium Pro</span>
              </Label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="allowFitScore"
                checked={formAllowFitScore}
                onChange={(e) => setFormAllowFitScore(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Label htmlFor="allowFitScore" className="cursor-pointer">
                Allow Fit Score Percentage
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

      {/* Assign Unassigned Data Dialog */}
      <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign unassigned data</DialogTitle>
            <DialogDescription>
              Move every job, question and resume that has no organization into the organization you pick.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Organization</Label>
              <select
                value={claimOrgRef}
                onChange={(e) => selectClaimOrg(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs dark:bg-input/30"
              >
                <option value="">Select an organization</option>
                {orgs.filter((o) => o.is_active).map((o) => (
                  <option key={o.id} value={o.ref}>{o.name} (@{o.domain})</option>
                ))}
              </select>
            </div>

            {claimPreview && (
              <>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Will move <strong>{claimPreview.data.jobs}</strong> jobs (with{" "}
                  <strong>{claimPreview.data.candidates}</strong> candidates),{" "}
                  <strong>{claimPreview.data.questions}</strong> questions and{" "}
                  <strong>{claimPreview.data.resumes}</strong> resumes.
                </p>

                {claimPreview.users.length > 0 && (
                  <div className="space-y-2">
                    <Label>Also link these users to the organization</Label>
                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-gray-200 p-3 dark:border-gray-800">
                      {claimPreview.users.map((u) => (
                        <label key={u.id} className="flex cursor-pointer items-start gap-3 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-gray-300"
                            checked={claimUserIds.includes(u.id)}
                            onChange={(e) =>
                              setClaimUserIds((ids) =>
                                e.target.checked ? [...ids, u.id] : ids.filter((id) => id !== u.id)
                              )
                            }
                          />
                          <span>
                            <span className="font-medium text-gray-900 dark:text-white">{u.name}</span>{" "}
                            <span className="text-gray-500">{u.email}</span>
                            <span className="block text-xs text-gray-500">
                              {u.role.replace("_", " ")} · currently {u.organization_name ?? "not linked"}
                            </span>
                            {u.role === "super_admin" && (
                              <span className="block text-xs text-amber-600 dark:text-amber-400">
                                Recommended if this account creates jobs — otherwise its new jobs will again have no
                                organization. It will then see only this organization&apos;s jobs and candidates
                                (managing organizations and users is unchanged).
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setClaimOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleClaim} disabled={!claimPreview || claiming}>
              {claiming ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
