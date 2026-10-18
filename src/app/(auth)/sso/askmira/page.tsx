import AskmiraSignIn from "@/components/auth/AskmiraSignIn";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Signing in | Anytimehire by CGB Solutions",
};

export default function AskmiraSso() {
  return <AskmiraSignIn />;
}
