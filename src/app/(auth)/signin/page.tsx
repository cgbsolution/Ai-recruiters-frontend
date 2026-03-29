import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "SignIn Page | Anytimehire by CGB Solutions ",
  description: "CGB Solutions | A One-Stop Solution for Your Business",
};

export default function SignIn() {
  return <SignInForm />;
}
