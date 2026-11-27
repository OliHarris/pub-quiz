import { Suspense } from "react";
import type { Metadata } from "next";
import { GameResults } from "@/components/dashboard/GameResults";
import { Splash } from "@/components/ui";

export const metadata: Metadata = { title: "Results · Pub Quiz" };

export default function GamePage({ params }: PageProps<"/host/games/[id]">) {
  return (
    <Suspense fallback={<Splash title="Loading…" />}>
      {params.then(({ id }) => (
        <GameResults gameId={id} />
      ))}
    </Suspense>
  );
}
