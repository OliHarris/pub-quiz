import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import {
  bankQuerySchema,
  DEFAULT_TIME_LIMIT,
  fromBankInputSchema,
  quizInputSchema,
  type QuizInput,
} from '@pub-quiz/shared';
import type { Database } from '../db/client';
import { listCategories, randomBankQuestions, searchBank } from '../repositories/bank';
import { getGame, listGames } from '../repositories/games';
import { createHost } from '../repositories/hosts';
import { createQuiz, deleteQuiz, getQuiz, listQuizzes, updateQuiz } from '../repositories/quizzes';
import { hostIdOf, requireHost } from './auth';
import { HttpError } from './errors';

/**
 * The REST API. Each URL is a "resource" (a noun) and the HTTP method says
 * what to do with it:
 *
 *   POST   /api/hosts                  create a host identity       → 201
 *   GET    /api/quizzes                list my quizzes
 *   POST   /api/quizzes                create a quiz                → 201
 *   POST   /api/quizzes/from-bank      create a quick quiz from the question bank → 201
 *   GET    /api/quizzes/:id            one quiz, with its questions
 *   PUT    /api/quizzes/:id            replace a quiz with a new version
 *   DELETE /api/quizzes/:id            delete a quiz                → 204
 *   GET    /api/bank/categories        question bank categories and counts
 *   GET    /api/bank/questions         search the question bank (?category=&difficulty=&search=&limit=&offset=)
 *   GET    /api/games                  my finished games
 *   GET    /api/games/:id              one game's full results
 */
export function apiRoutes(db: Database, { hostsPerWindow = 20 } = {}): Router {
  const api = Router();
  const authenticated = requireHost(db);

  // ─── Hosts ──────────────────────────────────────────────────────────────
  // Rate limited: without it, a script could create millions of hosts and fill the database.
  const hostCreationLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: hostsPerWindow, standardHeaders: 'draft-8', legacyHeaders: false });
  api.post('/hosts', hostCreationLimit, async (_req, res) => {
    res.status(201).json(await createHost(db));
  });

  // ─── Quizzes ────────────────────────────────────────────────────────────
  api.get('/quizzes', authenticated, async (_req, res) => {
    res.json({ quizzes: await listQuizzes(db, hostIdOf(res)) });
  });

  api.post('/quizzes', authenticated, async (req, res) => {
    const input = quizInputSchema.parse(req.body);
    res.status(201).json(await createQuiz(db, hostIdOf(res), input));
  });

  api.post('/quizzes/from-bank', authenticated, async (req, res) => {
    const input = fromBankInputSchema.parse(req.body);
    const picked = await randomBankQuestions(db, input);
    if (picked.length === 0) throw new HttpError(400, 'No questions in the bank match those choices');
    const quiz: QuizInput = {
      title: input.title || quickQuizTitle(input.categories),
      questions: picked.map(({ text, options, correctIndex }) => ({ text, options, correctIndex, timeLimitSec: DEFAULT_TIME_LIMIT })),
    };
    res.status(201).json(await createQuiz(db, hostIdOf(res), quiz));
  });

  api.get('/quizzes/:id', authenticated, async (req, res) => {
    const quiz = await getQuiz(db, idParam(req), hostIdOf(res));
    if (!quiz) throw new HttpError(404, 'Quiz not found');
    res.json(quiz);
  });

  api.put('/quizzes/:id', authenticated, async (req, res) => {
    const id = idParam(req);
    const input = quizInputSchema.parse(req.body);
    const quiz = await updateQuiz(db, id, hostIdOf(res), input);
    if (!quiz) throw new HttpError(404, 'Quiz not found');
    res.json(quiz);
  });

  api.delete('/quizzes/:id', authenticated, async (req, res) => {
    const deleted = await deleteQuiz(db, idParam(req), hostIdOf(res));
    if (!deleted) throw new HttpError(404, 'Quiz not found');
    res.status(204).end();
  });

  // ─── Question bank (public: no host key needed) ─────────────────────────
  api.get('/bank/categories', async (_req, res) => {
    res.json({ categories: await listCategories(db) });
  });

  api.get('/bank/questions', async (req, res) => {
    res.json(await searchBank(db, bankQuerySchema.parse(req.query)));
  });

  // ─── Past games ─────────────────────────────────────────────────────────
  api.get('/games', authenticated, async (_req, res) => {
    res.json({ games: await listGames(db, hostIdOf(res)) });
  });

  api.get('/games/:id', authenticated, async (req, res) => {
    const game = await getGame(db, idParam(req), hostIdOf(res));
    if (!game) throw new HttpError(404, 'Game not found');
    res.json(game);
  });

  return api;
}

/**
 * Reads the :id from the URL. A malformed id gets the same 404 as one that
 * doesn't exist, and so does someone else's quiz: we don't reveal whether
 * something exists if you're not allowed to see it.
 */
function idParam(req: Request): string {
  const parsed = z.uuid().safeParse(req.params.id);
  if (!parsed.success) throw new HttpError(404, 'Not found');
  return parsed.data;
}

function quickQuizTitle(categories: string[]): string {
  if (categories.length === 0) return 'Quick Quiz';
  if (categories.length <= 2) return `Quick Quiz: ${categories.join(' & ')}`;
  return 'Quick Quiz: Mixed Bag';
}
