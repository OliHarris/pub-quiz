import { createServer, type ServerResponse } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  answerPayloadSchema,
  hostResumePayloadSchema,
  joinPayloadSchema,
  playerResumePayloadSchema,
  sampleQuiz,
  type Ack,
  type AckResult,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@pub-quiz/shared';
import type { ZodType } from 'zod';
import type { Result, Room } from './game/Room';
import { RoomManager } from './game/RoomManager';
import { lanAddresses } from './lan';
import { secretsMatch } from './security';

type GameIo = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface GameServerOptions {
  /** Which websites may connect. `true` allows any (fine for development only). */
  corsOrigin?: string[] | true;
  /** Close rooms after this long with no activity. */
  idleRoomMs?: number;
  /** Serve this machine's network addresses at /lan (development only). */
  exposeLan?: boolean;
}

/**
 * Builds the game server without starting it, so tests can start it on any
 * free port and real use can start it on port 4000.
 *
 * This file is the "network layer": it turns WebSocket messages into calls on
 * a Room, and pushes the Room's state back out. The game rules live in Room.
 */
export function createGameServer(options: GameServerOptions = {}) {
  const { corsOrigin = true, idleRoomMs = 2 * 60 * 60 * 1000, exposeLan = false } = options;

  // Plain HTTP endpoints. Socket.IO answers its own /socket.io/ requests before these.
  const httpServer = createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === '/health') return sendJson(res, 200, { ok: true, rooms: rooms.size });
    if (pathname === '/lan' && exposeLan) return sendJson(res, 200, { addresses: lanAddresses() });
    sendJson(res, 404, { error: 'Not found' });
  });

  const io: GameIo = new Server(httpServer, { cors: { origin: corsOrigin } });

  // Whenever a room changes, send its new state to every screen in that room.
  const rooms = new RoomManager((room) => {
    io.to(room.code).emit('room:state', room.toPublicState());
  });

  io.on('connection', (socket) => {
    // ── Host (TV screen) ──
    socket.on('host:create', (ack) =>
      handle(ack, () => {
        const room = rooms.create(sampleQuiz);
        joinRoom(socket, room, 'host');
        return { ok: true, code: room.code, hostToken: room.hostToken };
      }),
    );

    socket.on('host:resume', (payload, ack) =>
      handle(ack, () => {
        const data = parse(hostResumePayloadSchema, payload);
        if (!data.ok) return data;
        const room = rooms.get(data.value.code);
        if (!room || !secretsMatch(room.hostToken, data.value.hostToken)) {
          return { ok: false, error: 'That game has ended' };
        }
        joinRoom(socket, room, 'host');
        return { ok: true };
      }),
    );

    socket.on('host:start', (ack) => handle(ack, () => asAck(hostRoom(socket), (room) => room.start())));
    socket.on('host:next', (ack) => handle(ack, () => asAck(hostRoom(socket), (room) => room.next())));

    // ── Players (phones) ──
    socket.on('player:join', (payload, ack) =>
      handle(ack, () => {
        const data = parse(joinPayloadSchema, payload);
        if (!data.ok) return data;
        const room = rooms.get(data.value.code);
        if (!room) return { ok: false, error: 'No game with that code. Check the TV screen.' };
        leaveRoom(socket);
        const added = room.addPlayer(data.value.name, socket.id);
        if (!added.ok) return added;
        joinRoom(socket, room, 'player', added.value.playerId);
        return { ok: true, ...added.value };
      }),
    );

    socket.on('player:resume', (payload, ack) =>
      handle(ack, () => {
        const data = parse(playerResumePayloadSchema, payload);
        if (!data.ok) return data;
        const room = rooms.get(data.value.code);
        const player = room?.findPlayerByToken(data.value.playerToken);
        if (!room || !player) return { ok: false, error: 'That game has ended' };
        joinRoom(socket, room, 'player', player.id);
        room.attachSocket(player.id, socket.id);
        return { ok: true, playerId: player.id, name: player.name, answerIndex: room.currentAnswerFor(player.id) };
      }),
    );

    socket.on('player:answer', (payload, ack) =>
      handle(ack, () => {
        const { role, code, playerId } = socket.data;
        const room = code ? rooms.get(code) : undefined;
        if (role !== 'player' || !room || !playerId) return { ok: false, error: 'Join a game first' };
        const data = parse(answerPayloadSchema, payload);
        if (!data.ok) return data;
        return asAck(room, (r) => r.submitAnswer(playerId, data.value.questionIndex, data.value.optionIndex));
      }),
    );

    socket.on('disconnect', () => leaveRoom(socket));
  });

  /** Remember which room and role this connection belongs to, and subscribe it to updates. */
  function joinRoom(socket: GameSocket, room: Room, role: 'host' | 'player', playerId?: string) {
    const { code, role: oldRole, playerId: oldPlayerId } = socket.data;
    const alreadyHere = code === room.code && oldRole === role && oldPlayerId === playerId;
    if (!alreadyHere) leaveRoom(socket);
    socket.data = { code: room.code, role, playerId };
    void socket.join(room.code);
    socket.emit('room:state', room.toPublicState());
  }

  function leaveRoom(socket: GameSocket) {
    const { code, role, playerId } = socket.data;
    if (!code) return;
    if (role === 'player' && playerId) rooms.get(code)?.detachSocket(playerId, socket.id);
    void socket.leave(code);
    socket.data = {};
  }

  function hostRoom(socket: GameSocket): Room | undefined {
    const { role, code } = socket.data;
    return role === 'host' && code ? rooms.get(code) : undefined;
  }

  const sweeper = setInterval(() => rooms.sweep(idleRoomMs), 60_000);
  sweeper.unref();
  httpServer.on('close', () => {
    clearInterval(sweeper);
    rooms.disposeAll();
  });

  return { httpServer, io, rooms };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Runs a request handler and always replies, even if it throws. An uncaught
 * error inside a socket handler would otherwise crash the whole server and end
 * every game.
 */
function handle<T extends object>(ack: Ack<T>, fn: () => AckResult<T>): void {
  let result: AckResult<T>;
  try {
    result = fn();
  } catch (error) {
    console.error('Handler failed', error);
    result = { ok: false, error: 'Something went wrong on our side' };
  }
  // A misbehaving client might not send a callback at all.
  if (typeof ack === 'function') ack(result);
}

/** Never trust what a client sends: check it matches the expected shape first. */
function parse<T>(schema: ZodType<T>, payload: unknown): Result<T> {
  const parsed = schema.safeParse(payload);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' };
}

function asAck(room: Room | undefined, action: (room: Room) => Result): AckResult {
  if (!room) return { ok: false, error: 'You are not hosting a game' };
  const result = action(room);
  return result.ok ? { ok: true } : result;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    // Only harmless, public information is served here, so any site may read it.
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}
