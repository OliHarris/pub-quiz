import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '../src/db/client';
import { hosts, quizQuestions } from '../src/db/schema';
import { seedQuestionBank } from '../src/db/seed';
import { countBankQuestions, insertBankQuestions, searchBank, textKey } from '../src/repositories/bank';
import { getGame, listGames, saveGame } from '../src/repositories/games';
import { createHost, findHostIdByKey } from '../src/repositories/hosts';
import { createQuiz } from '../src/repositories/quizzes';

let database: DatabaseHandle;

beforeAll(async () => {
  database = await openDatabase();
});
afterAll(async () => {
  await database.close();
});

describe('hosts', () => {
  it('finds a host by key, and never stores the key itself', async () => {
    const { hostId, hostKey } = await createHost(database.db);
    expect(await findHostIdByKey(database.db, hostKey)).toBe(hostId);
    expect(await findHostIdByKey(database.db, hostKey + 'x')).toBeNull();

    const [stored] = await database.db.select({ keyHash: hosts.keyHash }).from(hosts).where(eq(hosts.id, hostId));
    expect(stored?.keyHash).not.toContain(hostKey);
    expect(stored?.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('question bank', () => {
  it('seeds the starter questions once, however many times it runs', async () => {
    const first = await seedQuestionBank(database.db);
    expect(first.added).toBe(70);
    const second = await seedQuestionBank(database.db);
    expect(second.added).toBe(0);
    expect(await countBankQuestions(database.db)).toBe(70);
  });

  it('treats near-identical questions as duplicates', async () => {
    expect(textKey("What's the capital of France?")).toBe(textKey('What is the capital of France'));
    const added = await insertBankQuestions(
      database.db,
      [{ category: 'Geography', difficulty: 'medium', text: 'what is THE capital of australia', options: ['A', 'B'], correctIndex: 0 }],
      'test',
    );
    expect(added).toBe(0);
  });

  it('searches safely, treating % as a normal character', async () => {
    const result = await searchBank(database.db, { search: '%', limit: 10, offset: 0 });
    expect(result.total).toBe(0);
  });
});

describe('database rules', () => {
  it('refuses a question whose correct answer is out of range, even if our code had a bug', async () => {
    const { hostId } = await createHost(database.db);
    const quiz = await createQuiz(database.db, hostId, {
      title: 'Rules',
      questions: [{ text: 'Q?', options: ['A', 'B'], correctIndex: 0, timeLimitSec: 20 }],
    });
    // Bypass the validation layer and talk to the table directly:
    await expect(
      database.db.insert(quizQuestions).values({ quizId: quiz.id, position: 1, text: 'Bad', options: ['A', 'B'], correctIndex: 2, timeLimitSec: 20 }),
    ).rejects.toThrow();
  });
});

describe('games', () => {
  it('saves results and reports the winners, including ties', async () => {
    const { hostId } = await createHost(database.db);
    const id = await saveGame(database.db, {
      hostId,
      quizId: null,
      quizTitle: 'The Warm-Up Round',
      roomCode: 'BCDF',
      teams: [
        { name: 'Bears', score: 3000, rank: 1 },
        { name: 'Mockingbird', score: 3000, rank: 1 },
        { name: 'Quizerables', score: 500, rank: 3 },
      ],
    });
    const [summary] = await listGames(database.db, hostId);
    expect(summary).toMatchObject({ id, teamCount: 3, winners: ['Bears', 'Mockingbird'] });
    const detail = await getGame(database.db, id, hostId);
    expect(detail?.teams.map((t) => t.name)).toEqual(['Bears', 'Mockingbird', 'Quizerables']);

    const { hostId: someoneElse } = await createHost(database.db);
    expect(await getGame(database.db, id, someoneElse)).toBeNull();
  });
});
