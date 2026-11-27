import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { QuizInput } from '@pub-quiz/shared';
import { createApiApp } from '../src/api/app';
import { openDatabase, type DatabaseHandle } from '../src/db/client';
import { seedQuestionBank } from '../src/db/seed';

/**
 * REST API tests. supertest sends real HTTP requests to the Express app
 * without needing to start a server on a port.
 */

let database: DatabaseHandle;
let app: ReturnType<typeof createApiApp>;

beforeAll(async () => {
  database = await openDatabase();
  await seedQuestionBank(database.db);
  app = createApiApp({ db: database.db, corsOrigin: true, exposeLan: false, roomCount: () => 0 });
});
afterAll(async () => {
  await database.close();
});

async function newHostKey(): Promise<string> {
  const res = await request(app).post('/api/hosts').expect(201);
  return res.body.hostKey;
}

const validQuiz: QuizInput = {
  title: 'Friday Night Quiz',
  questions: [
    { text: 'Capital of France?', options: ['Paris', 'Lyon', 'Nice'], correctIndex: 0, timeLimitSec: 20 },
    { text: 'Largest ocean?', options: ['Atlantic', 'Pacific'], correctIndex: 1, timeLimitSec: 30 },
  ],
};

describe('hosts', () => {
  it('creates a host and returns a secret key', async () => {
    const res = await request(app).post('/api/hosts').expect(201);
    expect(res.body.hostKey).toMatch(/^pqh_[\w-]{40,}$/);
    expect(res.body.hostId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('authentication', () => {
  it('rejects requests without a key, or with a wrong one', async () => {
    await request(app).get('/api/quizzes').expect(401, { error: 'Missing host key' });
    await request(app).get('/api/quizzes').set('Authorization', 'Bearer pqh_wrong').expect(401, { error: 'Unknown host key' });
  });
});

describe('quizzes', () => {
  it('goes through the whole create → read → update → delete cycle', async () => {
    const key = await newHostKey();
    const auth = { Authorization: `Bearer ${key}` };

    const created = await request(app).post('/api/quizzes').set(auth).send(validQuiz).expect(201);
    expect(created.body).toMatchObject({ title: 'Friday Night Quiz', questions: validQuiz.questions });
    const id = created.body.id;

    const list = await request(app).get('/api/quizzes').set(auth).expect(200);
    expect(list.body.quizzes).toEqual([expect.objectContaining({ id, title: 'Friday Night Quiz', questionCount: 2 })]);

    const changed = { ...validQuiz, title: 'Saturday Quiz', questions: [validQuiz.questions[1]!] };
    const updated = await request(app).put(`/api/quizzes/${id}`).set(auth).send(changed).expect(200);
    expect(updated.body).toMatchObject({ title: 'Saturday Quiz', questions: [validQuiz.questions[1]] });

    await request(app).delete(`/api/quizzes/${id}`).set(auth).expect(204);
    await request(app).get(`/api/quizzes/${id}`).set(auth).expect(404);
  });

  it("keeps hosts' quizzes private from each other", async () => {
    const alice = { Authorization: `Bearer ${await newHostKey()}` };
    const bob = { Authorization: `Bearer ${await newHostKey()}` };
    const { body: quiz } = await request(app).post('/api/quizzes').set(alice).send(validQuiz).expect(201);

    // Bob gets "not found", not "forbidden": he isn't even told the quiz exists.
    await request(app).get(`/api/quizzes/${quiz.id}`).set(bob).expect(404);
    await request(app).put(`/api/quizzes/${quiz.id}`).set(bob).send(validQuiz).expect(404);
    await request(app).delete(`/api/quizzes/${quiz.id}`).set(bob).expect(404);
    const bobsList = await request(app).get('/api/quizzes').set(bob).expect(200);
    expect(bobsList.body.quizzes).toEqual([]);
  });

  it('explains exactly what is wrong with an invalid quiz', async () => {
    const auth = { Authorization: `Bearer ${await newHostKey()}` };
    const res = await request(app)
      .post('/api/quizzes')
      .set(auth)
      .send({
        title: '  ',
        questions: [{ text: 'Q?', options: ['Same', 'same'], correctIndex: 5, timeLimitSec: 7 }],
      })
      .expect(400);
    const paths = res.body.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['title', 'questions.0.timeLimitSec']));
    expect(res.body.error).toBeTruthy();
  });

  it('treats a malformed id as not found rather than crashing', async () => {
    const auth = { Authorization: `Bearer ${await newHostKey()}` };
    await request(app).get('/api/quizzes/not-a-uuid').set(auth).expect(404);
  });

  it('rejects broken JSON politely', async () => {
    const auth = { Authorization: `Bearer ${await newHostKey()}` };
    await request(app)
      .post('/api/quizzes')
      .set(auth)
      .set('Content-Type', 'application/json')
      .send('{"title": ')
      .expect(400, { error: 'Invalid JSON' });
  });
});

describe('question bank', () => {
  it('lists categories with counts', async () => {
    const res = await request(app).get('/api/bank/categories').expect(200);
    expect(res.body.categories).toEqual(expect.arrayContaining([{ category: 'Geography', count: 8 }]));
  });

  it('filters and searches questions', async () => {
    const res = await request(app).get('/api/bank/questions?category=Geography&search=capital').expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.questions.map((q: { text: string }) => q.text)).toEqual([
      'What is the capital of Australia?',
      'What is the capital of New Zealand?',
    ]);
  });

  it('rejects silly filter values', async () => {
    await request(app).get('/api/bank/questions?limit=5000').expect(400);
    await request(app).get('/api/bank/questions?difficulty=impossible').expect(400);
  });

  it('builds a quick quiz from random bank questions', async () => {
    const auth = { Authorization: `Bearer ${await newHostKey()}` };
    const res = await request(app)
      .post('/api/quizzes/from-bank')
      .set(auth)
      .send({ categories: ['Sport', 'Music'], difficulty: 'mixed', count: 5 })
      .expect(201);
    expect(res.body.title).toBe('Quick Quiz: Sport & Music');
    expect(res.body.questions).toHaveLength(5);
    expect(new Set(res.body.questions.map((q: { text: string }) => q.text)).size).toBe(5); // no repeats
  });

  it('says so when no questions match', async () => {
    const auth = { Authorization: `Bearer ${await newHostKey()}` };
    await request(app)
      .post('/api/quizzes/from-bank')
      .set(auth)
      .send({ categories: ['Underwater Basket Weaving'], count: 5 })
      .expect(400, { error: 'No questions in the bank match those choices' });
  });
});

describe('everything else', () => {
  it('returns JSON 404s for unknown routes', async () => {
    await request(app).get('/api/nope').expect(404, { error: 'Not found' });
  });

  it('reports health', async () => {
    await request(app).get('/health').expect(200, { ok: true, rooms: 0 });
  });
});
