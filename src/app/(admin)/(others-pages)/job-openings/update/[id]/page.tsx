import type { Metadata } from "next";
import React, { Suspense } from "react";
import { notFound } from "next/navigation";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CreateOpeningForm from "@/components/form/CreateOpeningForm";
import { isRef } from "@/lib/refs";

// Let TypeScript infer the types automatically
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  return {
    title: `CGB Solutions - Edit Job Opening ${id}`,
    description: "Ai Recruiters Web App - Edit Job Opening",
  };
}

export default async function UpdateJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The URL segment is the job's opaque ref; numeric ids (or anything else)
  // are "not found" and never reach the API.
  if (!isRef(id)) notFound();

  return (
    <>
      <div className="col-span-12 space-y-6 xl:col-span-12">
        <Suspense fallback={<div>Loading job data...</div>}>
          <CreateOpeningForm jobId={id} />
        </Suspense>
      </div>
    </>
  );
}