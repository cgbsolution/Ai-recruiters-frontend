"use client";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import Button from "@/components/ui/button/Button";
import { CalenderIcon, MailIcon, ChatIcon, PlusIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

type Candidate = {
  id: number;
  name: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  applied_date: string;
  status: "Applied" | "Interview" | "Offered" | "Rejected";
  image: string;
};

const statusColors: Record<string, string> = {
  Applied: "bg-yellow-100 text-yellow-600",
  Interview: "bg-green-100 text-green-600",
  Offered: "bg-indigo-100 text-indigo-600",
  Rejected: "bg-red-100 text-red-600",
};

const CandidateCards = () => {
  const [filter, setFilter] = useState<
    "All Candidates" | "Applied" | "Interview" | "Offered" | "Rejected"
  >("All Candidates");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCandidates = async () => {
      setLoading(true);
      try {
        const path =
          filter === "All Candidates"
            ? "/candidates/"
            : `/candidates/?status=${filter}`;
        const data = await api<Candidate[]>(path);
        setCandidates(data);
      } catch (err) {
        console.error("Error fetching candidates:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCandidates();
  }, [filter]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
            Candidates
          </h1>
        </div>
        <nav>
          <Button size="sm" variant="primary" startIcon={<PlusIcon />}>
            Add Candidates
          </Button>
        </nav>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-gray-200 mb-6">
        {["All Candidates", "Applied", "Interview", "Offered", "Rejected"].map(
          (tab) => (
            <button
              key={tab}
              className={`pb-2 text-sm font-medium ${
                filter === tab
                  ? "text-indigo-600 border-b-2 border-indigo-600"
                  : "text-gray-500 hover:text-gray-800"
              }`}
              onClick={() =>
                setFilter(
                  tab as
                    | "All Candidates"
                    | "Applied"
                    | "Interview"
                    | "Offered"
                    | "Rejected"
                )
              }
            >
              {tab}
            </button>
          )
        )}
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, idx) => (
            <article
              key={idx}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div>
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-8 w-full mt-8 rounded" />
            </article>
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">No candidates found</p>
          <p className="text-sm mt-1">
            {filter === "All Candidates"
              ? "No candidates have been added yet."
              : `No candidates with status "${filter}".`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {candidates.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between pb-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <Image
                    src={c.image || "/images/user/user-01.jpg"}
                    alt={c.name}
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                  <div>
                    <h4 className="font-semibold text-gray-800">{c.name}</h4>
                    <p className="text-sm text-gray-500">{c.role}</p>
                  </div>
                </div>
                <span
                  className={`px-3 py-1 text-xs font-medium rounded-full ${
                    statusColors[c.status]
                  }`}
                >
                  {c.status}
                </span>
              </div>

              <div className="space-y-2 text-sm text-gray-500 pt-4">
                <div className="flex align-middle">
                  <span><MailIcon /></span>&nbsp;{c.email}
                </div>
                <div className="flex align-middle">
                  <span><ChatIcon /></span>&nbsp;{c.phone}
                </div>
                <div className="flex align-middle">
                  <span><CalenderIcon /></span>&nbsp;{c.location}
                </div>
                <div className="flex align-middle">
                  <span><CalenderIcon /></span>&nbsp;Applied:{" "}
                  {formatDate(c.applied_date)}
                </div>
              </div>

              <div className="w-full mt-8">
                <Button className="w-full pt-2" size="sm" variant="primary">
                  Offer
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CandidateCards;
