import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { GameDetail, GameSummary, TeamResult } from '@pub-quiz/shared';
import type { Database } from '../db/client';
import { games, gameTeams } from '../db/schema';

export interface GameRecord {
  hostId: string;
  quizId: string | null;
  quizTitle: string;
  roomCode: string;
  teams: TeamResult[];
}

/** Saves a finished game and every team's result in one transaction. */
export async function saveGame(db: Database, record: GameRecord): Promise<string> {
  return db.transaction(async (tx) => {
    const [game] = await tx
      .insert(games)
      .values({ hostId: record.hostId, quizId: record.quizId, quizTitle: record.quizTitle, roomCode: record.roomCode })
      .returning({ id: games.id });
    if (record.teams.length) {
      await tx.insert(gameTeams).values(record.teams.map((team) => ({ ...team, gameId: game!.id })));
    }
    return game!.id;
  });
}

export async function listGames(db: Database, hostId: string, limit = 20): Promise<GameSummary[]> {
  const rows = await db
    .select({
      id: games.id,
      quizId: games.quizId,
      quizTitle: games.quizTitle,
      roomCode: games.roomCode,
      finishedAt: games.finishedAt,
      teamCount: count(gameTeams.id),
    })
    .from(games)
    .leftJoin(gameTeams, eq(gameTeams.gameId, games.id))
    .where(eq(games.hostId, hostId))
    .groupBy(games.id)
    .orderBy(desc(games.finishedAt))
    .limit(limit);
  if (rows.length === 0) return [];

  // A second, small query for the winners (more than one if they tied).
  const winners = await db
    .select({ gameId: gameTeams.gameId, name: gameTeams.name })
    .from(gameTeams)
    .where(and(inArray(gameTeams.gameId, rows.map((r) => r.id)), eq(gameTeams.rank, 1)))
    .orderBy(asc(gameTeams.name));

  return rows.map((row) => ({
    ...row,
    finishedAt: row.finishedAt.toISOString(),
    winners: winners.filter((w) => w.gameId === row.id).map((w) => w.name),
  }));
}

export async function getGame(db: Database, id: string, hostId: string): Promise<GameDetail | null> {
  const [game] = await db
    .select()
    .from(games)
    .where(and(eq(games.id, id), eq(games.hostId, hostId)))
    .limit(1);
  if (!game) return null;

  const teams = await db
    .select({ name: gameTeams.name, score: gameTeams.score, rank: gameTeams.rank })
    .from(gameTeams)
    .where(eq(gameTeams.gameId, id))
    .orderBy(asc(gameTeams.rank), asc(gameTeams.name));

  return {
    id: game.id,
    quizId: game.quizId,
    quizTitle: game.quizTitle,
    roomCode: game.roomCode,
    finishedAt: game.finishedAt.toISOString(),
    teamCount: teams.length,
    winners: teams.filter((t) => t.rank === 1).map((t) => t.name),
    teams,
  };
}
