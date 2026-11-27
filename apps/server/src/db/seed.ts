import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { bankQuestionSeedSchema } from '@pub-quiz/shared';
import { insertBankQuestions } from '../repositories/bank';
import type { Database } from './client';

/**
 * Fills the question bank from the JSON files in /data:
 *  - starter-bank.json: ~70 questions written by hand, always present
 *  - question-bank.json: the big AI-generated bank, once you've run the generator
 *
 * Safe to run any number of times: questions already in the bank are skipped.
 */

const seedFileSchema = z.object({ questions: z.array(bankQuestionSeedSchema) });

const SEED_FILES = [
  { file: '../../data/starter-bank.json', source: 'starter' },
  { file: '../../data/question-bank.json', source: 'generated' },
];

export async function seedQuestionBank(db: Database): Promise<{ added: number; files: string[] }> {
  let added = 0;
  const files: string[] = [];
  for (const { file, source } of SEED_FILES) {
    const path = fileURLToPath(new URL(file, import.meta.url));
    if (!existsSync(path)) continue;
    // Check the file's contents against the schema, so a bad edit fails loudly here, not halfway into the database.
    const { questions } = seedFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    added += await insertBankQuestions(db, questions, source);
    files.push(path.split('/').pop()!);
  }
  return { added, files };
}
