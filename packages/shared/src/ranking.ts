/**
 * Turning scores into positions. Shared because the server needs it to save
 * results and the screens need it to show the leaderboard, and they must agree.
 */

export interface Scored {
  name: string;
  score: number;
}

/** Sorted best first. Tied scores share a rank: 1, 2, 2, 4. */
export function rankPlayers<T extends Scored>(players: T[]): (T & { rank: number })[] {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return sorted.map((player) => ({
    ...player,
    rank: sorted.findIndex((p) => p.score === player.score) + 1,
  }));
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

export const formatPoints = (n: number) => n.toLocaleString('en-GB');
