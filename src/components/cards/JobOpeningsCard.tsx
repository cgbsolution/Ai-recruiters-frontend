"use client";
import React, { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EyeIcon,
  PencilIcon,
  MapPin,
  Users,
  Briefcase,
  Calendar,
  MoreVertical,
  CheckCircle2,
  Send,
  ClipboardList,
  Trash,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, apiPost } from "@/lib/api";

type Job = {
  id: number;
  title: string;
  department: string;
  location: string;
  job_type: string;
  openings: number;
  status: string;
  created_at: string;
  applications?: number;
  interviews?: number;
  candidates?: number;
  deadline?: string;
};

export const JobsOpeningsCard = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "All" | "Open" | "Inactive" | "Draft"
  >("All");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
  const router = useRouter();

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        setLoading(true);
        const data = await api<Job[]>("/jobs/");
        setJobs(data);
      } catch (error) {
        console.error("Error fetching jobs:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchJobs();
  }, []);

  // ctrl/cmd + k focus shortcut
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const statusColors: Record<string, string> = {
    Open: "bg-green-100 text-green-700",
    Inactive: "bg-red-100 text-red-700",
    Draft: "bg-gray-200 text-gray-600",
  };

  // Filtering
  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.title.toLowerCase().includes(search.toLowerCase()) ||
      job.department.toLowerCase().includes(search.toLowerCase()) ||
      job.location.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "All" ? true : job.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getPostedAgo = (created_at: string) => {
    if (!created_at) return "—";
    const created = new Date(created_at);
    const diff = Math.floor(
      (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)
    );
    return diff === 0 ? "Posted today" : `Posted ${diff} day${diff > 1 ? "s" : ""} ago`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleEditJob = (jobId: number) => {
    router.push(`/job-openings/update/${jobId}`);
  };

  const handleViewDetails = (jobId: number) => {
    router.push(`/job-openings/${jobId}/candidates`);
  };

  const handleDuplicateJob = async (jobId: number) => {
    try {
      const jobToDuplicate = jobs.find((job) => job.id === jobId);
      if (!jobToDuplicate) return;

      const duplicatedJob = {
        ...jobToDuplicate,
        title: `${jobToDuplicate.title} (Copy)`,
        status: "Draft",
        created_at: new Date().toISOString(),
        // Remove id to let backend generate new one
        id: undefined,
      };

      const newJob = await apiPost<Job>("/jobs/", duplicatedJob);
      setJobs((prev) => [newJob, ...prev]);
    } catch (error) {
      console.error("Error duplicating job:", error);
    }
  };

  const openDeleteDialog = (job: Job) => {
    setJobToDelete(job);
    setDeleteDialogOpen(true);
  };

  const handleDeleteJob = async () => {
    if (!jobToDelete) return;

    try {
      await api(`/jobs/${jobToDelete.id}`, { method: "DELETE" });
      setJobs((prev) => prev.filter((job) => job.id !== jobToDelete.id));
      setDeleteDialogOpen(false);
      setJobToDelete(null);
    } catch (error) {
      console.error("Error deleting job:", error);
    }
  };

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setJobToDelete(null);
  };

  return (
    <div className="col-span-12 space-y-6 xl:col-span-12">
      {/* Header with search & filter */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
            Active Job Openings
          </h1>
          <p className="text-sm text-gray-500 sm:text-base">
            Here's what you need to focus on today
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Input
            ref={inputRef}
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-[220px]"
          />

          <Select
            value={statusFilter}
            onValueChange={(val) => setStatusFilter(val as any)}
          >
            <SelectTrigger className="h-11 w-[150px]">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Status</SelectItem>
              <SelectItem value="Open">Open</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Card key={idx} className="p-6">
              <Skeleton className="h-6 w-50 mb-2" />
              <Skeleton className="h-5 w-24 mb-4" />
              <div className="flex gap-4 mb-3">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-5 w-28" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredJobs.length > 0 ? (
            filteredJobs.map((job) => (
              <Card
                key={job.id}
                className="px-2 transition-all duration-200 hover:shadow-md"
              >
                <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
                  <div>
                    <CardTitle className="text-lg font-semibold flex items-center gap-4">
                      {job.title}
                      <PencilIcon
                        className="w-5 h-5 text-gray-500 cursor-pointer hover:text-gray-700"
                        onClick={() => handleEditJob(job.id)}
                      />
                    </CardTitle>
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-5 h-5" /> {job.location} ·{" "}
                      {getPostedAgo(job.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        statusColors[job.status] || "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                </CardHeader>

                {/* Job stats */}
                <CardContent className="p-0 px-6 space-y-3">
                  <div className="flex items-center justify-between text-sm text-gray-700">
                    <div className="flex items-center gap-4">
                      <Briefcase className="w-5 h-5 text-gray-500" /> Openings
                    </div>
                    <span>{job.openings ?? 50}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm text-gray-700">
                    <div className="flex items-center gap-4">
                      <ClipboardList className="w-5 h-5 text-gray-500" /> Full Time
                    </div>
                    <span>{job.job_type}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm text-gray-700">
                    <div className="flex items-center gap-4">
                      <Send className="w-5 h-5 text-gray-500" /> Application Sent
                    </div>
                    <span>{job.applications ?? 0}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm text-gray-700">
                    <div className="flex items-center gap-4">
                      <CheckCircle2 className="w-5 h-5 text-gray-500" /> Interview Completed
                    </div>
                    <span>{job.interviews ?? 0}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm text-gray-700">
                    <div className="flex items-center gap-4">
                      <Users className="w-5 h-5 text-gray-500" /> Top Candidate Identified
                    </div>
                    <span>{job.candidates ?? 0}</span>
                  </div>
                </CardContent>
                {/* Footer */}
                <CardFooter className="flex justify-between items-center pt-4">
                  <Button
                    size="sm"
                    variant="primary"
                    className="flex-1 mr-1"
                    onClick={() => handleViewDetails(job.id)}
                  >
                    View Candidates
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-5 h-5 text-gray-600" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditJob(job.id)}>
                        <PencilIcon className="h-5 w-5 mr-2" />
                        Edit Opening
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicateJob(job.id)}>
                        <Briefcase className="h-5 w-5 mr-2" />
                        Duplicate Opening
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => openDeleteDialog(job)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash className="h-5 w-5 mr-2" />
                        Delete Post
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardFooter>
              </Card>
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <div className="max-w-md mx-auto">
                <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {search || statusFilter !== "All"
                    ? "No matching jobs found"
                    : "No job openings yet"}
                </h3>
                <p className="text-gray-500 mb-4">
                  {search || statusFilter !== "All"
                    ? "Try adjusting your search or filter criteria"
                    : "Create your first job opening to get started"}
                </p>
                {(search || statusFilter !== "All") && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("All");
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this job opening?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              <strong>"{jobToDelete?.title}"</strong> job opening and remove all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDeleteDialog}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteJob}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete Job Opening
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};