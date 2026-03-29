import SignUpForm from "@/components/auth/SignUpForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "SignUp Page | Anytimehire by CGB Solutions  ",
  description: "CGB Solutions | A One-Stop Solution for Your Business",
  // other metadata
};

export default function SignUp() {
  return <SignUpForm />;
}
