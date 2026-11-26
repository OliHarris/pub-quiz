import type { PublicPlayer } from "@pub-quiz/shared";

export interface RankedPlayer extends PublicPlayer {
  /** 1-based. Tied scores share a rank: 1, 2, 2, 4. */
  rank: number;
}

export function rankPlayers(players: PublicPlayer[]): RankedPlayer[] {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return sorted.map((player, i) => {
    const firstWithScore = sorted.findIndex((p) => p.score === player.score);
    return { ...player, rank: firstWithScore === -1 ? i + 1 : firstWithScore + 1 };
  });
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const suffix = ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

export const formatPoints = (n: number) => n.toLocaleString("en-GB");
