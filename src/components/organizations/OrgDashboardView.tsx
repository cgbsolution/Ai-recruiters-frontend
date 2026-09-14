"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import AiUsageAnalytics from "@/components/charts/AiUsageAnalytics";
import AiCreditUsageChart from "@/components/charts/AiCreditUsageChart";

interface OrgDetail {
  id: number;
  name: string;
  domain: string;
  is_active: boolean;
  max_jobs: number;
  max_candidates_per_job: number;
  created_at: string | null;
  user_count: number;
  job_count: number;
  candidate_count: number;
  role_breakdown: Record<string, number>;
  token_stats: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_cost: number;
    call_count: number;
  };
  jobs: Array<{
    id: number;
    title: string;
    department: string | null;
    location: string | null;
    status: string;
    created_at: string | null;
  }>;
}

/** `orgId` is the org ref from the URL (validated with isRef() by the page). */
export default function OrgDashboardView({ orgId }: { orgId: string }) {
  const { hasRole } = useAuth();
  const router = useRouter();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const orgData = await api<OrgDetail>(`/organizations/${orgId}`);
      setOrg(orgData);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
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

  if (!org) {
    return (
      <div className="text-center py-20 text-gray-500">Organization not found.</div>
    );
  }

  const ts = org.token_stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/organizations")}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Organizations
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{org.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-0">
              @{org.domain}
            </Badge>
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
          </div>
        </div>
        <div className="text-right text-sm text-gray-500 dark:text-gray-400">
          {org.max_jobs > 0 && (
            <p>Job limit: <strong className="text-gray-900 dark:text-white">{org.job_count} / {org.max_jobs}</strong></p>
          )}
          {org.max_candidates_per_job > 0 && (
            <p>Candidate limit: <strong className="text-gray-900 dark:text-white">{org.max_candidates_per_job} / job</strong></p>
          )}
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Users", value: org.user_count },
          { label: "Jobs", value: org.job_count },
          { label: "Candidates", value: org.candidate_count },
          { label: "AI Calls", value: ts.call_count },
        ].map((stat) => (
          <Card key={stat.label} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Cost Breakdown — same as dashboard */}
      <AiUsageAnalytics orgId={orgId} />

      {/* AI Credit Usage — same as dashboard */}
      <AiCreditUsageChart orgId={orgId} />

      {/* Jobs Table */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Jobs ({org.jobs.length})
          </h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-700/50">
              <TableHead className="px-6">Title</TableHead>
              <TableHead className="px-6">Department</TableHead>
              <TableHead className="px-6">Location</TableHead>
              <TableHead className="px-6 text-center">Status</TableHead>
              <TableHead className="px-6 text-center">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {org.jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-gray-400">
                  No jobs yet.
                </TableCell>
              </TableRow>
            ) : (
              org.jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="px-6 font-medium text-gray-900 dark:text-white">{job.title}</TableCell>
                  <TableCell className="px-6 text-gray-500 dark:text-gray-400">{job.department || "-"}</TableCell>
                  <TableCell className="px-6 text-gray-500 dark:text-gray-400">{job.location || "-"}</TableCell>
                  <TableCell className="px-6 text-center">
                    <Badge
                      variant="secondary"
                      className={`border-0 ${
                        job.status === "open"
                          ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-6 text-center text-gray-500 dark:text-gray-400 text-xs">
                    {job.created_at ? new Date(job.created_at).toLocaleDateString() : "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
