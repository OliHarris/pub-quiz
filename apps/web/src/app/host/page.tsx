import type { Metadata } from "next";
import { HostScreen } from "@/components/host/HostScreen";

export const metadata: Metadata = { title: "Host · Pub Quiz" };

export default function HostPage() {
  return <HostScreen />;
}
