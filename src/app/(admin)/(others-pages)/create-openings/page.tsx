import type { Metadata } from "next";
import React, { Suspense } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CreateOpeningForm from "@/components/form/CreateOpeningForm";

export const metadata: Metadata = {
  title: "CGB Solutions - Creating Openings",
  description: "Ai Recruiters Web App",
};

export default function CreateOpeningsPage() {
  return (
    <>
      <PageBreadcrumb pageTitle="Creating Openings" />
      {/* <div className="grid grid-cols-12 gap-4 md:gap-6"> */}
      <div className="col-span-12 space-y-6 xl:col-span-12">
        <Suspense fallback={<div>Loading...</div>}>
          <CreateOpeningForm />
        </Suspense>
      </div>
      {/* <div className="col-span-12 space-y-6 xl:col-span-4">
        </div> */}
      {/* </div> */}
    </>
  );
}
