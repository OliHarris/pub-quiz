import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, RoomState, ServerToClientEvents } from '@pub-quiz/shared';
import { createGameServer } from '../src/createGameServer';

/**
 * These tests start the real server on a random free port and talk to it over
 * real WebSockets, exactly like the TV and phones do.
 */

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: ReturnType<typeof createGameServer>;
let url: string;
const clients: Client[] = [];

beforeEach(async () => {
  server = createGameServer();
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await server.io.close();
});

async function newClient(): Promise<Client> {
  const client: Client = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(client);
  await new Promise<void>((resolve) => client.once('connect', () => resolve()));
  return client;
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
    const host = await newClient();
    const created = await host.emitWithAck('host:create');
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
    const host = await newClient();
    const created = await host.emitWithAck('host:create');
    if (!created.ok) throw new Error(created.error);
    const player = await newClient();
    await player.emitWithAck('player:join', { code: created.code, name: 'Sneaky' });

    expect(await player.emitWithAck('host:start')).toEqual({ ok: false, error: 'You are not hosting a game' });
  });

  it('lets a phone rejoin as the same team after losing connection', async () => {
    const host = await newClient();
    const created = await host.emitWithAck('host:create');
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
