"use client";

import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth, type UserRole } from "@/context/AuthContext";
import { toast } from "sonner";
import { Trash2, Power, Plus } from "lucide-react";
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

interface UserItem {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  is_email_verified: boolean;
  organization_id: number | null;
  organization_name: string | null;
  created_at: string | null;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "recruiter", label: "Recruiter" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

export default function AccessControlView() {
  const { user: currentUser, hasRole } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("recruiter");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api<UserItem[]>("/auth/users");
      setUsers(data);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchUsers().finally(() => setLoading(false));
  }, [fetchUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      await api("/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          email: formEmail.trim().toLowerCase(),
          password: formPassword,
          role: formRole,
        }),
      });
      setDialogOpen(false);
      setFormName("");
      setFormEmail("");
      setFormPassword("");
      setFormRole("recruiter");
      toast.success("User created successfully");
      await fetchUsers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u: UserItem) => {
    try {
      await api(`/auth/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      toast.success(
        u.is_active
          ? `"${u.name}" deactivated successfully`
          : `"${u.name}" activated successfully`
      );
      await fetchUsers();
    } catch {
      toast.error("Failed to update user status");
    }
  };

  const handleRoleChange = async (u: UserItem, newRole: UserRole) => {
    try {
      await api(`/auth/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      toast.success(`Role updated to ${newRole.replace("_", " ")}`);
      await fetchUsers();
    } catch {
      toast.error("Failed to update role");
    }
  };

  if (!hasRole("super_admin", "admin")) {
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

  const assignableRoles = ROLE_OPTIONS.filter((r) => {
    if (currentUser?.role === "super_admin") return true;
    // Admins can assign admin and recruiter, but not super_admin
    return r.value === "recruiter" || r.value === "admin";
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Access Control</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage user accounts, roles, and permissions
          </p>
        </div>
        <Button onClick={() => { setDialogOpen(true); setFormError(""); }}>
          <Plus className="w-4 h-4 mr-1" />
          Add User
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Users", value: users.length },
          { label: "Active", value: users.filter((u) => u.is_active).length },
          { label: "Pending", value: users.filter((u) => !u.is_active).length },
          { label: "Admins", value: users.filter((u) => u.role === "admin" || u.role === "super_admin").length },
          { label: "Recruiters", value: users.filter((u) => u.role === "recruiter").length },
        ].map((stat) => (
          <Card key={stat.label} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-700/50">
              <TableHead className="px-6">User</TableHead>
              <TableHead className="px-6">Email</TableHead>
              {hasRole("super_admin") && (
                <TableHead className="px-6">Organization</TableHead>
              )}
              <TableHead className="px-6 text-center">Role</TableHead>
              <TableHead className="px-6 text-center">Status</TableHead>
              <TableHead className="px-6 text-center">Joined</TableHead>
              <TableHead className="px-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-gray-500 dark:text-gray-400">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                const isSuperAdmin = u.role === "super_admin";
                const canModify = !isSelf && (!isSuperAdmin || hasRole("super_admin"));

                return (
                  <TableRow key={u.id}>
                    <TableCell className="px-6">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {u.name}
                        {isSelf && <span className="ml-2 text-xs text-blue-500">(you)</span>}
                      </p>
                    </TableCell>
                    <TableCell className="px-6 text-gray-600 dark:text-gray-400">{u.email}</TableCell>
                    {hasRole("super_admin") && (
                      <TableCell className="px-6">
                        {u.organization_name ? (
                          <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-0">
                            {u.organization_name}
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="px-6 text-center">
                      {canModify ? (
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                          className="text-xs px-2 py-1 rounded-md border border-input bg-transparent dark:bg-input/30"
                        >
                          {assignableRoles.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      ) : (
                        <Badge
                          variant="secondary"
                          className={`border-0 ${
                            u.role === "super_admin"
                              ? "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                              : u.role === "admin"
                              ? "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                              : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {u.role.replace("_", " ")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-6 text-center">
                      <Badge
                        variant="secondary"
                        className={`border-0 ${
                          u.is_active
                            ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                            : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {u.is_active ? "Active" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 text-center text-gray-500 dark:text-gray-400 text-xs">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell className="px-6 text-right">
                      {canModify && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title={u.is_active ? "Deactivate user" : "Activate user"}
                            onClick={() => handleToggleActive(u)}
                            className={`h-8 w-8 ${
                              u.is_active
                                ? "text-yellow-500 hover:text-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-900/30"
                                : "text-green-500 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/30"
                            }`}
                          >
                            <Power className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete user"
                            onClick={async () => {
                              if (!confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
                              try {
                                await api(`/auth/users/${u.id}`, { method: "DELETE" });
                                toast.success(`"${u.name}" deleted successfully`);
                                await fetchUsers();
                              } catch {
                                toast.error("Failed to delete user");
                              }
                            }}
                            className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) setFormError("");
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Fill in the details to add a new user to the system.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Full name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as UserRole)}
                  className="h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
                >
                  {assignableRoles.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
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
                {saving ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
