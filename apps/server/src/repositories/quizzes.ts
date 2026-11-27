import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import type { QuizDetail, QuizInput, QuizSummary } from '@pub-quiz/shared';
import type { Database } from '../db/client';
import { quizQuestions, quizzes } from '../db/schema';

/**
 * Every query is scoped to the host (`where host_id = …`), so one host can
 * never see or change another host's quizzes, even by guessing an id.
 */

export async function listQuizzes(db: Database, hostId: string): Promise<QuizSummary[]> {
  // One query: each quiz plus how many questions it has (a LEFT JOIN with GROUP BY).
  const rows = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      updatedAt: quizzes.updatedAt,
      questionCount: count(quizQuestions.id),
    })
    .from(quizzes)
    .leftJoin(quizQuestions, eq(quizQuestions.quizId, quizzes.id))
    .where(eq(quizzes.hostId, hostId))
    .groupBy(quizzes.id)
    .orderBy(desc(quizzes.updatedAt));

  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

export async function getQuiz(db: Database, id: string, hostId: string): Promise<QuizDetail | null> {
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.id, id), eq(quizzes.hostId, hostId)))
    .limit(1);
  if (!quiz) return null;

  const questions = await db
    .select({
      text: quizQuestions.text,
      options: quizQuestions.options,
      correctIndex: quizQuestions.correctIndex,
      timeLimitSec: quizQuestions.timeLimitSec,
    })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, id))
    .orderBy(asc(quizQuestions.position));

  return {
    id: quiz.id,
    title: quiz.title,
    questions,
    createdAt: quiz.createdAt.toISOString(),
    updatedAt: quiz.updatedAt.toISOString(),
  };
}

/**
 * Creating a quiz writes to two tables. A *transaction* makes that all-or-
 * nothing: if saving question 7 fails, the quiz and questions 1–6 are undone
 * too, so the database never holds half a quiz.
 */
export async function createQuiz(db: Database, hostId: string, input: QuizInput): Promise<QuizDetail> {
  const id = await db.transaction(async (tx) => {
    const [quiz] = await tx.insert(quizzes).values({ hostId, title: input.title }).returning({ id: quizzes.id });
    await tx.insert(quizQuestions).values(input.questions.map((q, position) => ({ ...q, quizId: quiz!.id, position })));
    return quiz!.id;
  });
  return (await getQuiz(db, id, hostId))!;
}

/**
 * Saves a new version of the whole quiz. Replacing every question (delete then
 * insert, inside one transaction) is simpler than working out which questions
 * moved or changed, and quizzes are small enough that it costs nothing.
 */
export async function updateQuiz(db: Database, id: string, hostId: string, input: QuizInput): Promise<QuizDetail | null> {
  const updated = await db.transaction(async (tx) => {
    const [quiz] = await tx
      .update(quizzes)
      .set({ title: input.title, updatedAt: sql`now()` })
      .where(and(eq(quizzes.id, id), eq(quizzes.hostId, hostId)))
      .returning({ id: quizzes.id });
    if (!quiz) return false;
    await tx.delete(quizQuestions).where(eq(quizQuestions.quizId, id));
    await tx.insert(quizQuestions).values(input.questions.map((q, position) => ({ ...q, quizId: id, position })));
    return true;
  });
  return updated ? getQuiz(db, id, hostId) : null;
}

export async function deleteQuiz(db: Database, id: string, hostId: string): Promise<boolean> {
  const deleted = await db
    .delete(quizzes)
    .where(and(eq(quizzes.id, id), eq(quizzes.hostId, hostId)))
    .returning({ id: quizzes.id });
  return deleted.length > 0;
}
