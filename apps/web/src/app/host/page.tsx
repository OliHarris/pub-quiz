import type { Metadata } from "next";
import { HostDashboard } from "@/components/dashboard/HostDashboard";

export const metadata: Metadata = { title: "Host · Pub Quiz" };

export default function HostPage() {
  return <HostDashboard />;
}
