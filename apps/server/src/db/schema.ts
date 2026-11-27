import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * The database tables, written in TypeScript. Drizzle turns this file into
 * SQL `CREATE TABLE` statements (migrations, in /drizzle) and uses it to
 * type-check every query.
 *
 *   hosts ──< quizzes ──< quiz_questions
 *     │          │
 *     └────< games >───< game_teams          bank_questions (stands alone)
 *
 * "──<" means one-to-many: one host has many quizzes, one quiz has many questions.
 */

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
};

/**
 * Someone who hosts quizzes. There are no usernames or passwords yet: each
 * host gets a secret key, kept in their browser. We store only a *hash* of
 * that key (a one-way fingerprint), so even someone who steals the database
 * can't use the keys.
 */
export const hosts = pgTable('hosts', {
  id: uuid('id').primaryKey().defaultRandom(),
  keyHash: text('key_hash').notNull().unique(),
  ...timestamps,
});

export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // If a host is deleted, their quizzes go too ("cascade").
    hostId: uuid('host_id')
      .notNull()
      .references(() => hosts.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    ...timestamps,
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  // An index is like a book's index: it makes "find this host's quizzes" fast
  // without reading every row.
  (t) => [index('quizzes_host_id_idx').on(t.hostId)],
);

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    /** Order within the quiz: 0, 1, 2… */
    position: integer('position').notNull(),
    text: text('text').notNull(),
    /** A Postgres array column: a list of strings in a single field. */
    options: text('options').array().notNull(),
    correctIndex: integer('correct_index').notNull(),
    timeLimitSec: integer('time_limit_sec').notNull(),
  },
  (t) => [
    // Two questions can't both be "number 3" in the same quiz.
    unique('quiz_questions_quiz_position_unique').on(t.quizId, t.position),
    // The database itself refuses nonsense, even if a bug in our code tried to save it.
    check('quiz_questions_options_count', sql`cardinality(${t.options}) between 2 and 4`),
    check('quiz_questions_correct_index', sql`${t.correctIndex} >= 0 and ${t.correctIndex} < cardinality(${t.options})`),
  ],
);

/** The shared question bank that quick quizzes are drawn from. */
export const bankQuestions = pgTable(
  'bank_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    category: text('category').notNull(),
    difficulty: text('difficulty', { enum: ['easy', 'medium', 'hard'] }).notNull(),
    text: text('text').notNull(),
    /** The question text simplified (lower case, no punctuation), so near-duplicates are caught. */
    textKey: text('text_key').notNull().unique(),
    options: text('options').array().notNull(),
    correctIndex: integer('correct_index').notNull(),
    /** Where it came from: "starter" (written by hand) or "generated" (by AI). */
    source: text('source').notNull(),
    ...timestamps,
  },
  (t) => [
    index('bank_questions_category_idx').on(t.category, t.difficulty),
    check('bank_questions_options_count', sql`cardinality(${t.options}) between 2 and 4`),
    check('bank_questions_correct_index', sql`${t.correctIndex} >= 0 and ${t.correctIndex} < cardinality(${t.options})`),
  ],
);

/** A finished game, saved for the host's "past games" list. */
export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id')
      .notNull()
      .references(() => hosts.id, { onDelete: 'cascade' }),
    // If the quiz is later deleted, keep the results but forget the link ("set null").
    quizId: uuid('quiz_id').references(() => quizzes.id, { onDelete: 'set null' }),
    /** A copy of the title at the time, so results still make sense if the quiz is renamed or deleted. */
    quizTitle: text('quiz_title').notNull(),
    roomCode: text('room_code').notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('games_host_id_idx').on(t.hostId, t.finishedAt)],
);

export const gameTeams = pgTable(
  'game_teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    score: integer('score').notNull(),
    rank: integer('rank').notNull(),
  },
  (t) => [index('game_teams_game_id_idx').on(t.gameId)],
);
