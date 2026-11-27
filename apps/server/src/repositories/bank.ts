import { and, asc, count, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import type { BankCategory, BankQuestion, BankQuestionSeed, BankSearchResult, Difficulty } from '@pub-quiz/shared';
import type { Database } from '../db/client';
import { bankQuestions } from '../db/schema';

const bankColumns = {
  id: bankQuestions.id,
  category: bankQuestions.category,
  difficulty: bankQuestions.difficulty,
  text: bankQuestions.text,
  options: bankQuestions.options,
  correctIndex: bankQuestions.correctIndex,
};

/** "What's the capital of France?" and "What is the capital of France" become the same key. */
export function textKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/\bwhat's\b/g, 'what is')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Adds questions, quietly skipping any that are already in the bank
 * ("ON CONFLICT DO NOTHING"), so running the seed twice is harmless.
 * Returns how many were actually new.
 */
export async function insertBankQuestions(db: Database, questions: BankQuestionSeed[], source: string): Promise<number> {
  let added = 0;
  // Insert in chunks: one giant statement with thousands of rows can hit database limits.
  for (let i = 0; i < questions.length; i += 500) {
    const chunk = questions.slice(i, i + 500).map((q) => ({ ...q, textKey: textKey(q.text), source }));
    const inserted = await db
      .insert(bankQuestions)
      .values(chunk)
      .onConflictDoNothing({ target: bankQuestions.textKey })
      .returning({ id: bankQuestions.id });
    added += inserted.length;
  }
  return added;
}

export async function countBankQuestions(db: Database): Promise<number> {
  const [row] = await db.select({ total: count() }).from(bankQuestions);
  return row?.total ?? 0;
}

export async function listCategories(db: Database): Promise<BankCategory[]> {
  return db
    .select({ category: bankQuestions.category, count: count() })
    .from(bankQuestions)
    .groupBy(bankQuestions.category)
    .orderBy(asc(bankQuestions.category));
}

export async function searchBank(
  db: Database,
  filters: { category?: string; difficulty?: Difficulty; search?: string; limit: number; offset: number },
): Promise<BankSearchResult> {
  const conditions: SQL[] = [];
  if (filters.category) conditions.push(eq(bankQuestions.category, filters.category));
  if (filters.difficulty) conditions.push(eq(bankQuestions.difficulty, filters.difficulty));
  if (filters.search) {
    // Escape % and _ so a search for "100%" means the text "100%", not "100 then anything".
    const escaped = filters.search.replace(/[\\%_]/g, (c) => `\\${c}`);
    conditions.push(ilike(bankQuestions.text, `%${escaped}%`));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [questions, [totalRow]] = await Promise.all([
    db
      .select(bankColumns)
      .from(bankQuestions)
      .where(where)
      .orderBy(asc(bankQuestions.category), asc(bankQuestions.text))
      .limit(filters.limit)
      .offset(filters.offset),
    db.select({ total: count() }).from(bankQuestions).where(where),
  ]);
  return { questions, total: totalRow?.total ?? 0 };
}

/** A random selection, for "make me a quick quiz". */
export async function randomBankQuestions(
  db: Database,
  filters: { categories: string[]; difficulty: Difficulty | 'mixed'; count: number },
): Promise<BankQuestion[]> {
  const conditions: SQL[] = [];
  if (filters.categories.length) conditions.push(inArray(bankQuestions.category, filters.categories));
  if (filters.difficulty !== 'mixed') conditions.push(eq(bankQuestions.difficulty, filters.difficulty));
  return db
    .select(bankColumns)
    .from(bankQuestions)
    .where(conditions.length ? and(...conditions) : undefined)
    // Fine for a few thousand rows. For millions you'd pick random ids instead of shuffling the whole table.
    .orderBy(sql`random()`)
    .limit(filters.count);
}
