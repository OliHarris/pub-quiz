/**
 * Builds the big question bank with Claude, once, for a few dollars.
 *
 *   npm run bank:generate                 show the plan and estimated cost (free, no API calls)
 *   npm run bank:generate -- --yes        start: submit the "write questions" batch
 *   npm run bank:generate                 later: check progress and move to the next step
 *   npm run bank:generate -- --watch      keep checking every minute until it's finished
 *   npm run bank:generate -- --model claude-sonnet-5-5 --yes    use a cheaper model
 *
 * How it works (a two-pass "write, then check" pipeline):
 *   1. WRITE   One request per (category × difficulty × theme) asks Claude for 35
 *              questions as JSON, matching a schema.
 *   2. CHECK   A second batch shows each question to Claude *without* the answer
 *              and asks it to answer and flag anything ambiguous or out of date.
 *              We keep only questions where both passes agree and nothing was flagged.
 *   3. SAVE    Accepted questions are de-duplicated and written to
 *              data/question-bank.json. The server loads that file into the database
 *              on start-up (or run `npm run db:seed`).
 *
 * Both passes use the Message Batches API: requests run in the background (usually
 * within an hour) at half the normal price. Progress is saved in .data/bank-job.json,
 * so you can stop and come back at any time.
 *
 * Needs an API key in ANTHROPIC_API_KEY (from https://console.anthropic.com).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { bankQuestionSeedSchema, DIFFICULTIES, type BankQuestionSeed, type Difficulty } from '@pub-quiz/shared';
import { textKey } from '../src/repositories/bank';

// ─── Settings ───────────────────────────────────────────────────────────────

const QUESTIONS_PER_REQUEST = 35;
const QUESTIONS_PER_CHECK = 30;

/** Two themes per category, so the two requests for each slot don't overlap much. */
const CATEGORIES: Record<string, [string, string]> = {
  'General Knowledge': ['everyday facts, numbers and trivia', 'famous firsts, inventions and things people should know'],
  Geography: ['countries, capitals and flags', 'rivers, mountains, landmarks and physical geography'],
  History: ['ancient and medieval history', 'modern history from 1700 onwards'],
  'Science & Nature': ['physics, chemistry and space', 'biology, the human body and the natural world'],
  Sport: ['football, rugby and cricket', 'the Olympics, tennis, golf and other sports'],
  Music: ['pop and rock from the 1960s to today', 'classical music, instruments and music theory'],
  'Film & TV': ['films and the people who make them', 'television series, characters and presenters'],
  'Food & Drink': ['dishes and cuisines from around the world', 'drinks, ingredients and cooking terms'],
  Literature: ['classic novels, poems and plays', 'authors, characters and modern books'],
  'Art & Design': ['painters, paintings and sculpture', 'architecture, design and famous buildings'],
  Technology: ['computers, the internet and gadgets', 'engineering, transport and inventions'],
  'Words & Language': ['word meanings, origins and spelling', 'languages, phrases, idioms and grammar'],
};

const PRICES_PER_MILLION: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};
const BATCH_DISCOUNT = 0.5;

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));
const JOB_FILE = fileURLToPath(new URL('../.data/bank-job.json', import.meta.url));
const OUTPUT_FILE = `${DATA_DIR}question-bank.json`;

// ─── What we ask Claude for ─────────────────────────────────────────────────

const WRITER_SYSTEM = `You write questions for a friendly British pub quiz.

Rules for every question:
- Exactly one answer is clearly correct. The wrong answers are plausible but definitely wrong.
- Only use facts that are well established and won't change. Avoid "current", "latest", "most recent", record holders, reigning champions, living people's ages, populations and anything else that goes out of date.
- Give 4 answer options. You may use "True"/"False" as the only two options for at most two questions per batch.
- Keep questions under 200 characters and each answer under 80 characters.
- Never give the answer away in the question, and never use "all of the above" or "none of the above".
- Vary which option is correct.
- Use British English spelling. A British flavour is welcome, but most questions should be fair to anyone.
- Nothing offensive, political or about private individuals.
- Difficulty: "easy" means most adults would know it; "medium" means a regular pub quizzer would; "hard" means only keen quizzers would.
- For each question, add a one-sentence explanation of why the answer is correct.`;

const CHECKER_SYSTEM = `You are a meticulous fact-checker for a pub quiz. For each question, work out the correct answer yourself, then say whether exactly one option is clearly correct.

Flag a problem (in a few words) if a question is ambiguous, has more than one defensible answer, depends on facts that change over time, is factually shaky, gives its answer away, or could offend. Otherwise set problem to null. Be strict: a wrongly marked answer ruins a quiz night.`;

const writerOutput = z.object({
  questions: z.array(
    z.object({
      text: z.string(),
      options: z.array(z.string()),
      correctIndex: z.number().int(),
      explanation: z.string(),
    }),
  ),
});

const checkerOutput = z.object({
  reviews: z.array(
    z.object({
      id: z.string(),
      answer: z.enum(['A', 'B', 'C', 'D']),
      confident: z.boolean(),
      problem: z.string().nullable(),
    }),
  ),
});

// ─── Saved progress ─────────────────────────────────────────────────────────

interface Candidate extends BankQuestionSeed {
  id: string;
  explanation: string;
}

type Job =
  | { stage: 'writing'; model: string; batchId: string; startedAt: string; usage: Usage }
  | { stage: 'checking'; model: string; batchId: string; startedAt: string; usage: Usage; candidates: Candidate[] };

interface Usage {
  input: number;
  output: number;
}

const loadJob = (): Job | null => (existsSync(JOB_FILE) ? (JSON.parse(readFileSync(JOB_FILE, 'utf8')) as Job) : null);
function saveJob(job: Job | null) {
  mkdirSync(fileURLToPath(new URL('../.data/', import.meta.url)), { recursive: true });
  writeFileSync(JOB_FILE, job ? JSON.stringify(job, null, 2) : 'null');
}

// ─── Main ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const job = loadJob();
  if (!job) {
    const model = option('model') ?? 'claude-opus-5-5';
    if (!PRICES_PER_MILLION[model]) throw new Error(`Unknown model "${model}". Try one of: ${Object.keys(PRICES_PER_MILLION).join(', ')}`);
    printPlan(model);
    if (!flag('yes')) {
      console.log('\nNothing has been sent. Run again with --yes to start (this spends money on your API account).');
      return;
    }
    await startWriting(model);
    return;
  }

  do {
    const current = loadJob();
    if (!current) break;
    const finished = await advance(current);
    if (finished || !flag('watch')) break;
    console.log('   Checking again in a minute… (Ctrl+C to stop; progress is saved)');
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  } while (true);
}

function printPlan(model: string) {
  const slots = Object.keys(CATEGORIES).length * DIFFICULTIES.length * 2;
  const written = slots * QUESTIONS_PER_REQUEST;
  const checks = Math.ceil(written / QUESTIONS_PER_CHECK);
  // Rough token guesses per request. Thinking makes output hard to predict, hence a range.
  const writeTokens = { input: 900, outputLow: 4_000, outputHigh: 9_000 };
  const checkTokens = { input: 2_600, outputLow: 2_500, outputHigh: 7_000 };
  const price = PRICES_PER_MILLION[model]!;
  const cost = (input: number, output: number) => ((input * price.input + output * price.output) / 1e6) * BATCH_DISCOUNT;
  const low = slots * cost(writeTokens.input, writeTokens.outputLow) + checks * cost(checkTokens.input, checkTokens.outputLow);
  const high = slots * cost(writeTokens.input, writeTokens.outputHigh) + checks * cost(checkTokens.input, checkTokens.outputHigh);

  console.log(`📚 Question bank plan (${model}, Batch API at half price)`);
  console.log(`   ${Object.keys(CATEGORIES).length} categories × ${DIFFICULTIES.length} difficulties × 2 themes = ${slots} writing requests`);
  console.log(`   ≈ ${written.toLocaleString()} questions written, then ${checks} checking requests`);
  console.log(`   Expect roughly 1,800–2,300 to pass the check and the duplicate filter`);
  console.log(`   Estimated cost: $${low.toFixed(2)}–$${high.toFixed(2)}`);
}

async function startWriting(model: string) {
  const client = new Anthropic();
  const existing = existingQuestionsByCategory();
  type Requests = Parameters<typeof client.messages.batches.create>[0]['requests'];
  const requests: Requests = [];

  for (const [category, themes] of Object.entries(CATEGORIES)) {
    for (const difficulty of DIFFICULTIES) {
      themes.forEach((theme, themeIndex) => {
        const avoid = (existing.get(category) ?? []).slice(0, 40);
        requests.push({
          custom_id: `write|${category}|${difficulty}|${themeIndex}`.replace(/[^\w|-]/g, '_').slice(0, 64),
          params: {
            model,
            max_tokens: 32_000,
            system: WRITER_SYSTEM,
            output_config: { effort: 'medium', format: zodOutputFormat(writerOutput) },
            messages: [
              {
                role: 'user',
                content:
                  `Write ${QUESTIONS_PER_REQUEST} ${difficulty} questions for the category "${category}", focusing on ${theme}.` +
                  (avoid.length ? `\n\nThese are already in the bank, so don't repeat them:\n${avoid.map((t) => `- ${t}`).join('\n')}` : ''),
              },
            ],
          },
        });
      });
    }
  }

  const batch = await client.messages.batches.create({ requests });
  saveJob({ stage: 'writing', model, batchId: batch.id, startedAt: new Date().toISOString(), usage: { input: 0, output: 0 } });
  console.log(`\n✍️  Submitted ${requests.length} writing requests (batch ${batch.id}).`);
  console.log('   Run `npm run bank:generate` later to check on it (usually under an hour), or add --watch.');
}

/** Moves the job forward if its batch has finished. Returns true when everything is done. */
async function advance(job: Job): Promise<boolean> {
  const client = new Anthropic();
  const batch = await client.messages.batches.retrieve(job.batchId);
  if (batch.processing_status !== 'ended') {
    const { processing, succeeded, errored } = batch.request_counts;
    console.log(`⏳ ${job.stage === 'writing' ? 'Writing' : 'Checking'}: ${succeeded} done, ${processing} in progress, ${errored} failed.`);
    return false;
  }

  if (job.stage === 'writing') {
    const { candidates, usage } = await collectWritten(client, job.batchId);
    const total = addUsage(job.usage, usage);
    console.log(`✅ Writing finished: ${candidates.length} new, valid, non-duplicate questions.`);
    await startChecking(client, job.model, candidates, total);
    return false;
  }

  const { accepted, rejected, usage } = await collectChecked(client, job.batchId, job.candidates);
  const total = addUsage(job.usage, usage);
  const saved = saveAccepted(accepted, job.model);
  saveJob(null);
  console.log(`✅ Checking finished: ${accepted.length} accepted, ${rejected} rejected.`);
  console.log(`📚 data/question-bank.json now has ${saved} questions.`);
  console.log(`💷 Actual cost: about $${costOf(job.model, total).toFixed(2)} (${total.input.toLocaleString()} input + ${total.output.toLocaleString()} output tokens, half price).`);
  console.log('   Restart the server, or run `npm run db:seed`, to load them into the database.');
  return true;
}

async function collectWritten(client: Anthropic, batchId: string) {
  const seen = new Set(existingKeys());
  const candidates: Candidate[] = [];
  const usage: Usage = { input: 0, output: 0 };
  let failures = 0;

  for await (const result of await client.messages.batches.results(batchId)) {
    if (result.result.type !== 'succeeded') {
      failures++;
      continue;
    }
    const message = result.result.message;
    usage.input += message.usage.input_tokens;
    usage.output += message.usage.output_tokens;
    // Check why it stopped before reading the answer: a refusal or a cut-off has no usable JSON.
    if (message.stop_reason !== 'end_turn') {
      failures++;
      continue;
    }
    const [, category, difficulty] = result.custom_id.split('|');
    const parsed = parseJson(message, writerOutput);
    if (!parsed) {
      failures++;
      continue;
    }
    for (const q of parsed.questions) {
      const realCategory = Object.keys(CATEGORIES).find((c) => c.replace(/[^\w|-]/g, '_') === category) ?? category!;
      const candidate = bankQuestionSeedSchema.safeParse({ ...q, category: realCategory, difficulty });
      if (!candidate.success) continue; // too long, wrong number of options, etc.
      const key = textKey(candidate.data.text);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ ...candidate.data, id: `q${candidates.length}`, explanation: q.explanation });
    }
  }
  if (failures) console.log(`   (${failures} writing requests failed or were unusable; skipped)`);
  return { candidates, usage };
}

async function startChecking(client: Anthropic, model: string, candidates: Candidate[], usage: Usage) {
  type Requests = Parameters<typeof client.messages.batches.create>[0]['requests'];
  const requests: Requests = [];
  for (let i = 0; i < candidates.length; i += QUESTIONS_PER_CHECK) {
    const chunk = candidates.slice(i, i + QUESTIONS_PER_CHECK);
    // The checker never sees which answer the writer marked as correct.
    const listing = chunk
      .map((q) => `${q.id}. ${q.text}\n${q.options.map((o, j) => `   ${'ABCD'[j]}) ${o}`).join('\n')}`)
      .join('\n\n');
    requests.push({
      custom_id: `check-${i / QUESTIONS_PER_CHECK}`,
      params: {
        model,
        max_tokens: 32_000,
        system: CHECKER_SYSTEM,
        output_config: { effort: 'medium', format: zodOutputFormat(checkerOutput) },
        messages: [{ role: 'user', content: `Review each of these quiz questions (use the id before each one):\n\n${listing}` }],
      },
    });
  }
  const batch = await client.messages.batches.create({ requests });
  saveJob({ stage: 'checking', model, batchId: batch.id, startedAt: new Date().toISOString(), usage, candidates });
  console.log(`🔍 Submitted ${requests.length} checking requests (batch ${batch.id}).`);
}

async function collectChecked(client: Anthropic, batchId: string, candidates: Candidate[]) {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const verdicts = new Map<string, boolean>();
  const usage: Usage = { input: 0, output: 0 };

  for await (const result of await client.messages.batches.results(batchId)) {
    if (result.result.type !== 'succeeded') continue;
    const message = result.result.message;
    usage.input += message.usage.input_tokens;
    usage.output += message.usage.output_tokens;
    if (message.stop_reason !== 'end_turn') continue;
    const parsed = parseJson(message, checkerOutput);
    for (const review of parsed?.reviews ?? []) {
      const candidate = byId.get(review.id);
      if (!candidate) continue;
      const agrees = 'ABCD'.indexOf(review.answer) === candidate.correctIndex;
      verdicts.set(review.id, agrees && review.confident && review.problem === null);
    }
  }
  // Anything the checker didn't review (a failed request) is rejected too: better safe than wrong.
  const accepted = candidates.filter((c) => verdicts.get(c.id) === true).map(tidyOptions);
  return { accepted, rejected: candidates.length - accepted.length, usage };
}

/**
 * Numbers go in order (1905, 1912, 1918…), True/False stays as it is, and
 * everything else is shuffled so the right answer isn't usually in the same place.
 */
function tidyOptions(candidate: Candidate): BankQuestionSeed {
  const { category, difficulty, text, options, correctIndex } = candidate;
  const correct = options[correctIndex]!;
  let ordered: string[];
  if (options.length === 2 && options[0] === 'True' && options[1] === 'False') ordered = options;
  else if (options.every((o) => /^-?[\d,.]+(\s?\w+)?$/.test(o))) {
    ordered = [...options].sort((a, b) => parseFloat(a.replace(/,/g, '')) - parseFloat(b.replace(/,/g, '')));
  } else ordered = shuffle(options);
  return { category, difficulty: difficulty as Difficulty, text, options: ordered, correctIndex: ordered.indexOf(correct) };
}

/** Fisher–Yates: every order is equally likely (unlike the common `sort(() => Math.random() - 0.5)`, which is biased). */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function saveAccepted(accepted: BankQuestionSeed[], model: string): number {
  const current = existsSync(OUTPUT_FILE)
    ? z.object({ questions: z.array(bankQuestionSeedSchema) }).parse(JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'))).questions
    : [];
  const keys = new Set(current.map((q) => textKey(q.text)));
  const merged = [...current, ...accepted.filter((q) => !keys.has(textKey(q.text)))];
  writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      {
        description: 'Generated with Claude and checked by a second, blind pass. See scripts/generate-question-bank.ts.',
        generatedWith: { model, date: new Date().toISOString().slice(0, 10) },
        questions: merged,
      },
      null,
      1,
    ) + '\n',
  );
  return merged.length;
}

// ─── Small helpers ──────────────────────────────────────────────────────────

/** The JSON answer is in the text block (thinking blocks come first). */
function parseJson<T>(message: Anthropic.Message, schema: z.ZodType<T>): T | null {
  const text = message.content.find((block) => block.type === 'text');
  if (!text || text.type !== 'text') return null;
  try {
    const parsed = schema.safeParse(JSON.parse(text.text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function readSeedFile(name: string): BankQuestionSeed[] {
  const path = `${DATA_DIR}${name}`;
  if (!existsSync(path)) return [];
  return z.object({ questions: z.array(bankQuestionSeedSchema) }).parse(JSON.parse(readFileSync(path, 'utf8'))).questions;
}

function existingQuestions(): BankQuestionSeed[] {
  return [...readSeedFile('starter-bank.json'), ...readSeedFile('question-bank.json')];
}

function existingKeys(): string[] {
  return existingQuestions().map((q) => textKey(q.text));
}

function existingQuestionsByCategory(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const q of existingQuestions()) map.set(q.category, [...(map.get(q.category) ?? []), q.text]);
  return map;
}

const addUsage = (a: Usage, b: Usage): Usage => ({ input: a.input + b.input, output: a.output + b.output });

function costOf(model: string, usage: Usage): number {
  const price = PRICES_PER_MILLION[model] ?? { input: 0, output: 0 };
  return ((usage.input * price.input + usage.output * price.output) / 1e6) * BATCH_DISCOUNT;
}

main().catch((error: unknown) => {
  if (error instanceof Anthropic.AuthenticationError) {
    console.error('🔑 No valid API key. Set ANTHROPIC_API_KEY (from https://console.anthropic.com) and try again.');
  } else if (error instanceof Anthropic.APIError) {
    console.error(`API error ${error.status}: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
