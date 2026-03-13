"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  Search,
  Database,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  Trash2,
  Sparkles,
} from "lucide-react";
import { api, apiPost, apiUpload, API_BASE } from "@/lib/api";
import { notifySuccess, notifyError } from "@/lib/notify";
import BulkUploadModal from "./BulkUploadModal";

interface ResumeItem {
  id: number;
  candidate_email: string;
  candidate_name: string | null;
  phone: string | null;
  current_designation: string | null;
  experience_years: number | null;
  skills: string[];
  education: string[];
  location: string | null;
  parsing_status: string;
  parsed_at: string | null;
  created_at: string | null;
  resume_file_path: string | null;
}

interface ResumeListResponse {
  items: ResumeItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface StatsResponse {
  total: number;
  completed: number;
  pending: number;
  failed: number;
}

export default function ResumeDatabaseView() {
  const [items, setItems] = useState<ResumeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const fetchResumes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        status: "all",
      });
      if (search) params.set("search", search);

      const data = await api<ResumeListResponse>(
        `/resume-database/?${params.toString()}`
      );
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (err: any) {
      notifyError(err.message || "Failed to load resumes");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api<StatsResponse>("/resume-database/stats");
      setStats(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchResumes();
  }, [fetchResumes]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this resume record? This cannot be undone.")) return;
    try {
      await api(`/resume-database/${id}`, { method: "DELETE" });
      notifySuccess("Resume deleted");
      fetchResumes();
      fetchStats();
    } catch (err: any) {
      notifyError(err.message || "Failed to delete");
    }
  };

  const handleUploadDone = () => {
    setShowUpload(false);
    fetchResumes();
    fetchStats();
  };

  const handleCleanup = async () => {
    try {
      const result = await apiPost<{ deleted: number; message: string }>(
        "/resume-database/cleanup",
        {}
      );
      if (result.deleted > 0) {
        notifySuccess(result.message);
        fetchResumes();
        fetchStats();
      } else {
        notifySuccess("No stale records found — database is clean.");
      }
    } catch (err: any) {
      notifyError(err.message || "Cleanup failed");
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">
            Parsed
          </span>
        );
      case "processing":
        return (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">
            Processing
          </span>
        );
      case "failed":
        return (
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">
            Failed
          </span>
        );
      default:
        return (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
            Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="w-6 h-6 text-blue-600" />
            Resume Database
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Central repository of all candidate resumes. Upload in bulk and search by skills, experience, location.
          </p>
        </div>
        <div className="flex gap-2">
          {stats && stats.failed > 0 && (
            <Button variant="outline" onClick={handleCleanup} className="gap-2">
              <Sparkles className="w-4 h-4" />
              Clean Up ({stats.failed})
            </Button>
          )}
          <Button onClick={() => setShowUpload(true)} className="gap-2">
            <Upload className="w-4 h-4" />
            Upload Resumes
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-500">Total Resumes</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-500">Parsed</p>
            <p className="text-2xl font-bold text-green-600">{stats.completed.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-500">Processing</p>
            <p className="text-2xl font-bold text-blue-600">{stats.pending.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-500">Failed</p>
            <p className="text-2xl font-bold text-red-600">{stats.failed.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, email, skills, location..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9"
          />
          {search && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button variant="outline" onClick={handleSearch}>
          Search
        </Button>
      </div>

      {/* Results info */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {search ? (
            <>
              Showing <span className="font-medium">{total}</span> result(s) for &quot;{search}&quot;
            </>
          ) : (
            <>
              <span className="font-medium">{total}</span> resume(s) in database
            </>
          )}
        </p>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <Database className="w-10 h-10 text-gray-300" />
            <p className="text-sm text-gray-500">
              {search ? "No resumes match your search." : "No resumes uploaded yet."}
            </p>
            {!search && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUpload(true)}
                className="mt-2 gap-1"
              >
                <Upload className="w-4 h-4" /> Upload Resumes
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="px-4 text-xs font-medium text-gray-600">NAME</TableHead>
                  <TableHead className="px-4 text-xs font-medium text-gray-600">EMAIL</TableHead>
                  <TableHead className="px-4 text-xs font-medium text-gray-600">DESIGNATION</TableHead>
                  <TableHead className="px-4 text-xs font-medium text-gray-600">EXPERIENCE</TableHead>
                  <TableHead className="px-4 text-xs font-medium text-gray-600">SKILLS</TableHead>
                  <TableHead className="px-4 text-xs font-medium text-gray-600">LOCATION</TableHead>
                  <TableHead className="px-4 text-xs font-medium text-gray-600">STATUS</TableHead>
                  <TableHead className="px-4 text-xs font-medium text-gray-600 w-20">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="px-4">
                      <p className="font-medium text-gray-800 text-sm">
                        {item.candidate_name || "—"}
                      </p>
                    </TableCell>
                    <TableCell className="px-4 text-sm text-gray-600">
                      {item.candidate_email.startsWith("noemail_") || item.candidate_email.endsWith("@pending.local")
                        ? "—"
                        : item.candidate_email}
                    </TableCell>
                    <TableCell className="px-4 text-sm text-gray-600">
                      {item.current_designation || "—"}
                    </TableCell>
                    <TableCell className="px-4 text-sm text-gray-600">
                      {item.experience_years != null
                        ? `${item.experience_years} yrs`
                        : "—"}
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="flex flex-wrap gap-1 max-w-[250px]">
                        {(item.skills || []).slice(0, 4).map((skill) => (
                          <span
                            key={skill}
                            className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded"
                          >
                            {skill}
                          </span>
                        ))}
                        {(item.skills || []).length > 4 && (
                          <span className="text-xs text-gray-400">
                            +{item.skills.length - 4}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 text-sm text-gray-600">
                      {item.location || "—"}
                    </TableCell>
                    <TableCell className="px-4">
                      {statusBadge(item.parsing_status)}
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="flex items-center gap-1">
                        {item.resume_file_path && (
                          <a
                            href={`${API_BASE.replace(/\/api$/, "")}/${item.resume_file_path.replace(/\\/g, "/")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-blue-600 p-1"
                            title="View Resume"
                          >
                            <FileText className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-gray-400 hover:text-red-600 p-1"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <BulkUploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onDone={handleUploadDone}
      />
    </div>
  );
}
