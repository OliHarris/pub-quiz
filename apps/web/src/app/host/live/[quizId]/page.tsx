import { Suspense } from "react";
import type { Metadata } from "next";
import { HostScreen } from "@/components/host/HostScreen";
import { Splash } from "@/components/ui";

export const metadata: Metadata = { title: "Live · Pub Quiz" };

/** The TV screen for one quiz: /host/live/<quiz id>, or /host/live/sample. */
export default function LivePage({ params }: PageProps<"/host/live/[quizId]">) {
  return (
    <Suspense fallback={<Splash title="Opening the doors…" />}>
      {params.then(({ quizId }) => (
        <HostScreen quizId={quizId} />
      ))}
    </Suspense>
  );
}
