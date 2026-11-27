"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatPoints, ordinal } from "@pub-quiz/shared";
import { api, ApiError, queryKeys } from "@/lib/api";
import { formatDateTime, plural } from "@/lib/format";
import { primaryButtonClass, Splash } from "../ui";
import { PageShell, Skeleton } from "./PageShell";

/** The saved results of one finished game. */
export function GameResults({ gameId }: { gameId: string }) {
  const game = useQuery({ queryKey: queryKeys.game(gameId), queryFn: () => api.getGame(gameId) });

  if (game.isError) {
    const notFound = game.error instanceof ApiError && game.error.status === 404;
    return (
      <Splash title={notFound ? "Game not found" : "Couldn't load the results"} detail={notFound ? undefined : game.error.message}>
        <Link href="/host" className="text-brass underline underline-offset-4">
          Back to dashboard
        </Link>
      </Splash>
    );
  }

  return (
    <PageShell
      back={{ href: "/host", label: "Dashboard" }}
      actions={
        game.data?.quizId ? (
          <Link href={`/host/live/${game.data.quizId}`} className={primaryButtonClass}>
            Play this quiz again
          </Link>
        ) : undefined
      }
    >
      {game.isPending ? (
        <>
          <Skeleton className="h-14 w-1/2" />
          <Skeleton className="h-48" />
        </>
      ) : (
        <>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-chalk-dim">Results</p>
            <h1 className="font-display text-4xl font-bold">{game.data.quizTitle}</h1>
            <p className="mt-1 text-chalk-dim">
              {formatDateTime(game.data.finishedAt)} · room {game.data.roomCode} · {plural(game.data.teamCount, "team")}
            </p>
          </div>
          <table className="w-full overflow-hidden rounded-2xl bg-felt-light text-left">
            <thead className="text-sm uppercase tracking-[0.15em] text-chalk-dim">
              <tr>
                <th scope="col" className="px-5 py-3">Place</th>
                <th scope="col" className="px-5 py-3">Team</th>
                <th scope="col" className="px-5 py-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-felt-lighter">
              {game.data.teams.map((team) => (
                <tr key={team.name} className={team.rank === 1 ? "bg-brass/15" : ""}>
                  <td className="px-5 py-3 font-display font-bold">
                    {team.rank === 1 && "🏆 "}
                    {ordinal(team.rank)}
                  </td>
                  <td className="px-5 py-3 font-semibold">{team.name}</td>
                  <td className="px-5 py-3 text-right font-display tabular-nums">{formatPoints(team.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </PageShell>
  );
}
