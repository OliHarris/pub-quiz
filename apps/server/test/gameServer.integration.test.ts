import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, RoomState, ServerToClientEvents } from '@pub-quiz/shared';
import { createGameServer } from '../src/createGameServer';
import { openDatabase, type DatabaseHandle } from '../src/db/client';
import { listGames } from '../src/repositories/games';
import { createHost } from '../src/repositories/hosts';
import { createQuiz } from '../src/repositories/quizzes';

/**
 * These tests start the real server on a random free port and talk to it over
 * real WebSockets, exactly like the TV and phones do.
 */

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let database: DatabaseHandle;
let server: ReturnType<typeof createGameServer>;
let url: string;
const clients: Client[] = [];

// One in-memory database for the file: a real PostgreSQL, gone when the tests finish.
beforeAll(async () => {
  database = await openDatabase();
});
afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  server = createGameServer({ db: database.db });
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await server.io.close();
});

async function newClient(auth?: { hostKey: string }): Promise<Client> {
  const client: Client = connect(url, { transports: ['websocket'], forceNew: true, auth });
  clients.push(client);
  await new Promise<void>((resolve) => client.once('connect', () => resolve()));
  return client;
}

/** A connected host screen, signed in with a fresh host key. */
async function newHost(): Promise<{ client: Client; hostId: string }> {
  const { hostId, hostKey } = await createHost(database.db);
  return { client: await newClient({ hostKey }), hostId };
}

/** Waits until the server pushes a state that passes the check. */
function nextState(client: Client, check: (s: RoomState) => boolean): Promise<RoomState> {
  return new Promise((resolve) => {
    const listener = (state: RoomState) => {
      if (!check(state)) return;
      client.off('room:state', listener);
      resolve(state);
    };
    client.on('room:state', listener);
  });
}

describe('game server over WebSockets', () => {
  it('runs a question from start to reveal with a host and two teams', async () => {
    const { client: host } = await newHost();
    const created = await host.emitWithAck('host:create', { quizId: 'sample' });
    if (!created.ok) throw new Error(created.error);

    const bears = await newClient();
    const mock = await newClient();
    const joinedBears = await bears.emitWithAck('player:join', { code: created.code, name: 'Bears' });
    const joinedMock = await mock.emitWithAck('player:join', { code: created.code.toLowerCase(), name: 'Mock' });
    expect(joinedBears.ok && joinedMock.ok).toBe(true);

    const questionShown = nextState(bears, (s) => s.phase === 'question');
    expect(await host.emitWithAck('host:start')).toEqual({ ok: true });
    const question = await questionShown;
    expect(question.question?.text).toBe('Which planet is known as the Red Planet?');

    const revealed = nextState(host, (s) => s.phase === 'reveal');
    await bears.emitWithAck('player:answer', { questionIndex: 0, optionIndex: 1 }); // Mars, correct
    await mock.emitWithAck('player:answer', { questionIndex: 0, optionIndex: 0 }); // Venus
    const reveal = await revealed;
    expect(reveal.reveal?.correctIndex).toBe(1);
    expect(reveal.players.find((p) => p.name === 'Bears')!.score).toBeGreaterThan(500);
    expect(reveal.players.find((p) => p.name === 'Mock')!.score).toBe(0);
  });

  it('only lets the host control the game', async () => {
    const { client: host } = await newHost();
    const created = await host.emitWithAck('host:create', { quizId: 'sample' });
    if (!created.ok) throw new Error(created.error);
    const player = await newClient();
    await player.emitWithAck('player:join', { code: created.code, name: 'Sneaky' });

    expect(await player.emitWithAck('host:start')).toEqual({ ok: false, error: 'You are not hosting a game' });
  });

  it('lets a phone rejoin as the same team after losing connection', async () => {
    const { client: host } = await newHost();
    const created = await host.emitWithAck('host:create', { quizId: 'sample' });
    if (!created.ok) throw new Error(created.error);

    const phone = await newClient();
    const joined = await phone.emitWithAck('player:join', { code: created.code, name: 'Bears' });
    if (!joined.ok) throw new Error(joined.error);

    const wentOffline = nextState(host, (s) => s.players[0]?.connected === false);
    phone.disconnect();
    await wentOffline;

    const phoneAgain = await newClient();
    const backOnline = nextState(host, (s) => s.players[0]?.connected === true);
    const resumed = await phoneAgain.emitWithAck('player:resume', {
      code: created.code,
      playerToken: joined.playerToken,
    });
    expect(resumed).toEqual({ ok: true, playerId: joined.playerId, name: 'Bears', answerIndex: null });
    await backOnline;
  });

  it('rejects bad input with a helpful message instead of crashing', async () => {
    const phone = await newClient();
    expect(await phone.emitWithAck('player:join', { code: 'ZZZZ', name: 'Bears' })).toEqual({
      ok: false,
      error: 'No game with that code. Check the TV screen.',
    });
    // Deliberately wrong shape, as a hacker might send from the console:
    const bad = await (phone as unknown as Socket).emitWithAck('player:join', { code: 42 });
    expect(bad.ok).toBe(false);
  });
});

describe('hosting saved quizzes', () => {
  const myQuiz = {
    title: 'Two Question Test',
    questions: [
      { text: 'Is water wet?', options: ['Yes', 'No'], correctIndex: 0, timeLimitSec: 10 },
      { text: 'Two plus two?', options: ['3', '4', '5'], correctIndex: 1, timeLimitSec: 10 },
    ],
  };

  it('refuses to create a room without a valid host key', async () => {
    const anonymous = await newClient();
    expect(await anonymous.emitWithAck('host:create', { quizId: 'sample' })).toEqual({
      ok: false,
      error: 'Reload the page to host a game',
    });
    const wrongKey = await newClient({ hostKey: 'pqh_not-a-real-key' });
    expect((await wrongKey.emitWithAck('host:create', { quizId: 'sample' })).ok).toBe(false);
  });

  it("plays a host's own quiz, but not someone else's", async () => {
    const { client: host, hostId } = await newHost();
    const quiz = await createQuiz(database.db, hostId, myQuiz);

    const stateArrives = nextState(host, (s) => s.quizTitle === 'Two Question Test');
    const created = await host.emitWithAck('host:create', { quizId: quiz.id });
    expect(created.ok).toBe(true);
    expect((await stateArrives).totalQuestions).toBe(2);

    const { client: otherHost } = await newHost();
    expect(await otherHost.emitWithAck('host:create', { quizId: quiz.id })).toEqual({
      ok: false,
      error: "That quiz doesn't exist",
    });
  });

  it('saves the results when a game finishes', async () => {
    const { client: host, hostId } = await newHost();
    const quiz = await createQuiz(database.db, hostId, myQuiz);
    const created = await host.emitWithAck('host:create', { quizId: quiz.id });
    if (!created.ok) throw new Error(created.error);

    const phone = await newClient();
    await phone.emitWithAck('player:join', { code: created.code, name: 'Bears' });
    await host.emitWithAck('host:start');
    await phone.emitWithAck('player:answer', { questionIndex: 0, optionIndex: 0 }); // right
    await host.emitWithAck('host:next'); // → leaderboard
    await host.emitWithAck('host:next'); // → question 2
    await phone.emitWithAck('player:answer', { questionIndex: 1, optionIndex: 0 }); // wrong
    await host.emitWithAck('host:next'); // → leaderboard
    const finished = nextState(host, (s) => s.phase === 'finished');
    await host.emitWithAck('host:next'); // → finished
    await finished;

    // Saving happens in the background; give it a moment.
    await expect.poll(() => listGames(database.db, hostId)).toHaveLength(1);
    const [game] = await listGames(database.db, hostId);
    expect(game).toMatchObject({ quizId: quiz.id, quizTitle: 'Two Question Test', teamCount: 1, winners: ['Bears'] });
  });
});
