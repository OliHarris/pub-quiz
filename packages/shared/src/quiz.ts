import { z } from 'zod';
import type { Question } from './types';

/**
 * Rules for quizzes that hosts write in the quiz builder. The browser uses
 * them to show errors next to the right field; the API uses the same rules to
 * reject anything invalid before it reaches the database.
 */

export const TIME_LIMIT_OPTIONS = [10, 15, 20, 30, 45, 60] as const;
export const DEFAULT_TIME_LIMIT = 20;
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const QUIZ_TITLE_MAX = 80;
export const QUESTION_TEXT_MAX = 200;
export const OPTION_TEXT_MAX = 80;
export const MAX_QUESTIONS = 50;

export const questionInputSchema = z
  .object({
    text: z.string().trim().min(1, 'Write the question').max(QUESTION_TEXT_MAX, `Keep questions under ${QUESTION_TEXT_MAX} characters`),
    options: z
      .array(z.string().trim().min(1, 'Fill in this answer, or remove it').max(OPTION_TEXT_MAX, `Keep answers under ${OPTION_TEXT_MAX} characters`))
      .min(2, 'Give at least 2 answers')
      .max(4, 'Give at most 4 answers'),
    correctIndex: z.number().int().min(0, 'Mark the correct answer'),
    timeLimitSec: z
      .number()
      .int()
      .refine((n) => (TIME_LIMIT_OPTIONS as readonly number[]).includes(n), 'Pick a time limit from the list'),
  })
  .superRefine((q, ctx) => {
    if (q.correctIndex >= q.options.length) {
      ctx.addIssue({ code: 'custom', path: ['correctIndex'], message: 'Mark the correct answer' });
    }
    const seen = new Set<string>();
    q.options.forEach((option, i) => {
      const key = option.trim().toLowerCase();
      if (key && seen.has(key)) ctx.addIssue({ code: 'custom', path: ['options', i], message: 'Two answers are the same' });
      seen.add(key);
    });
  });

export const quizInputSchema = z.object({
  title: z.string().trim().min(1, 'Give your quiz a title').max(QUIZ_TITLE_MAX, `Keep the title under ${QUIZ_TITLE_MAX} characters`),
  questions: z
    .array(questionInputSchema)
    .min(1, 'Add at least one question')
    .max(MAX_QUESTIONS, `A quiz can have up to ${MAX_QUESTIONS} questions`),
});
export type QuizInput = z.infer<typeof quizInputSchema>;

/** "Make me a quick quiz": random questions from the question bank. */
export const fromBankInputSchema = z.object({
  title: z.string().trim().max(QUIZ_TITLE_MAX).optional(),
  categories: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  difficulty: z.enum([...DIFFICULTIES, 'mixed']).default('mixed'),
  count: z.number().int().min(1).max(MAX_QUESTIONS).default(10),
});
export type FromBankInput = z.input<typeof fromBankInputSchema>;

/** Filters for browsing the question bank. Arrives as URL query text, hence `coerce`. */
export const bankQuerySchema = z.object({
  category: z.string().trim().max(60).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
export interface BankQuery {
  category?: string;
  difficulty?: Difficulty;
  search?: string;
  limit?: number;
  offset?: number;
}

/** One question for the bank, as stored in the JSON seed files. */
export const bankQuestionSeedSchema = z
  .object({
    category: z.string().trim().min(1).max(60),
    difficulty: z.enum(DIFFICULTIES),
    text: z.string().trim().min(1).max(QUESTION_TEXT_MAX),
    options: z.array(z.string().trim().min(1).max(OPTION_TEXT_MAX)).min(2).max(4),
    correctIndex: z.number().int().min(0).max(3),
  })
  .refine((q) => q.correctIndex < q.options.length, { message: 'correctIndex is out of range', path: ['correctIndex'] });
export type BankQuestionSeed = z.infer<typeof bankQuestionSeedSchema>;

// ─── Shapes the REST API sends back ─────────────────────────────────────────

export interface QuizSummary {
  id: string;
  title: string;
  questionCount: number;
  updatedAt: string;
}

export interface QuizDetail {
  id: string;
  title: string;
  questions: Question[];
  createdAt: string;
  updatedAt: string;
}

export interface BankQuestion extends BankQuestionSeed {
  id: string;
}

export interface BankCategory {
  category: string;
  count: number;
}

export interface BankSearchResult {
  questions: BankQuestion[];
  total: number;
}

export interface TeamResult {
  name: string;
  score: number;
  rank: number;
}

export interface GameSummary {
  id: string;
  quizId: string | null;
  quizTitle: string;
  roomCode: string;
  teamCount: number;
  winners: string[];
  finishedAt: string;
}

export interface GameDetail extends GameSummary {
  teams: TeamResult[];
}

/** Every API error looks like this, so the front end can handle them all the same way. */
export interface ApiErrorBody {
  error: string;
  issues?: { path: string; message: string }[];
}
