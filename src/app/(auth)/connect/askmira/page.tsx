import AskmiraConnectApprove from "@/components/askmira/AskmiraConnectApprove";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connect AskMiraa | Anytimehire by CGB Solutions",
};

export default function ConnectAskmira() {
  return <AskmiraConnectApprove />;
}
