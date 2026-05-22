import type { Metadata } from "next";
import React from "react";
import CodeSandboxTester from "@/components/code-test/CodeSandboxTester";

export const metadata: Metadata = {
  title: "Code Sandbox Tester - AI Recruiters",
  description: "Standalone sandbox to test the interview code-execution pipeline.",
};

export default function CodeTestPage() {
  return (
    <div className="p-4 md:p-6">
      <CodeSandboxTester />
    </div>
  );
}
