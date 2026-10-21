import AskmiraConnectApprove from "@/components/askmira/AskmiraConnectApprove";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connect AskMira | Anytimehire by CGB Solutions",
};

export default function ConnectAskmira() {
  return <AskmiraConnectApprove />;
}
