/**
 * Loads the question bank JSON files into the database.
 * The server does this on start-up too; this is for doing it by hand
 * (stop the server first: the embedded database allows one process at a time).
 *
 *   npm run db:seed
 */
import { mkdirSync } from 'node:fs';
import { openDatabase } from '../src/db/client';
import { seedQuestionBank } from '../src/db/seed';
import { countBankQuestions } from '../src/repositories/bank';

const dataDir = process.env.DATA_DIR ?? './.data/pglite';
mkdirSync(dataDir, { recursive: true });
const { db, close } = await openDatabase(dataDir);
const { added, files } = await seedQuestionBank(db);
console.log(`📚 Added ${added} new questions from ${files.join(', ')}. The bank now has ${await countBankQuestions(db)}.`);
await close();
