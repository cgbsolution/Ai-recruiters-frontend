import type { Metadata } from "next";
import React from "react";
// import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import QuestionsBank from "@/components/question-bank/AddQuestion";


export const metadata: Metadata = {
  title: "CGB Solutions - Ai Recruiters",
  description: "Ai Recruiters Web App",
};

export default function QuestionBank() {
  return (
    <>
      <div data-tour="question-bank-page">
        {/* <PageBreadcrumb pageTitle="Dashboard" /> */}
             <div className="col-span-12 space-y-6 xl:col-span-12">
      <QuestionsBank />
      </div>
      </div>
    </>
  );
}
