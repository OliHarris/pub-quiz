import { Suspense } from "react";
import type { Metadata } from "next";
import { PlayerScreen } from "@/components/player/PlayerScreen";
import { Splash } from "@/components/ui";

export const metadata: Metadata = { title: "Play · Pub Quiz" };

/**
 * The room code comes from the URL (/play/KDBX). With Cache Components on,
 * Next.js serves a static shell straight away, and the part that needs the
 * code renders inside Suspense once it's known.
 */
export default function PlayPage({ params }: PageProps<"/play/[code]">) {
  return (
    <Suspense fallback={<Splash title="Connecting…" />}>
      {params.then(({ code }) => (
        <PlayerScreen code={code} />
      ))}
    </Suspense>
  );
}
