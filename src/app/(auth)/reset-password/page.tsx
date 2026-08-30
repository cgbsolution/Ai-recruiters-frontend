import { Suspense } from "react";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password | Anytimehire.ai",
  description: "Choose a new password for your account",
};

export default function ResetPassword() {
  // useSearchParams needs a Suspense boundary or the whole route opts out of
  // static rendering at build time.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
