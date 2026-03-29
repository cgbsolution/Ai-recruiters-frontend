import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Metadata } from "next";
import VerifyEmailContent from "./VerifyEmailContent";

export const metadata: Metadata = {
  title: "Verify Email | Ai Recruiters",
};

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col flex-1 lg:w-1/2 w-full items-center justify-center px-6">
          <Loader2 className="h-16 w-16 text-blue-500 animate-spin mx-auto" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
