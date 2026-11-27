import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  answerPayloadSchema,
  hostCreatePayloadSchema,
  hostResumePayloadSchema,
  joinPayloadSchema,
  playerResumePayloadSchema,
  sampleQuiz,
  SAMPLE_QUIZ_ID,
  type Ack,
  type AckResult,
  type ClientToServerEvents,
  type HandshakeAuth,
  type Quiz,
  type ServerToClientEvents,
  type SocketData,
} from '@pub-quiz/shared';
import type { ZodType } from 'zod';
import { createApiApp } from './api/app';
import type { Database } from './db/client';
import type { Result, Room } from './game/Room';
import { RoomManager } from './game/RoomManager';
import { saveGame } from './repositories/games';
import { findHostIdByKey } from './repositories/hosts';
import { getQuiz } from './repositories/quizzes';
import { secretsMatch } from './security';

type GameIo = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface GameServerOptions {
  db: Database;
  /** Which websites may connect. `true` allows any (fine for development only). */
  corsOrigin?: string[] | true;
  /** Close rooms after this long with no activity. */
  idleRoomMs?: number;
  /** Serve this machine's network addresses at /lan (development only). */
  exposeLan?: boolean;
  /** How many hosts one IP address may create per 15 minutes. */
  hostsPerWindow?: number;
}

/** What the server remembers about each room besides the game itself. */
interface RoomInfo {
  hostId: string;
  quizId: string | null;
  resultsSaved: boolean;
}

/**
 * Builds the whole back-end without starting it, so tests can start it on any
 * free port and real use can start it on port 4000:
 *
 *   one HTTP server
 *    ├─ Express: the REST API (/api/...) and /health
 *    └─ Socket.IO: live games over WebSockets
 *
 * This file is the "network layer" for games: it turns WebSocket messages into
 * calls on a Room, and pushes the Room's state back out. The game rules live in Room.
 */
export function createGameServer(options: GameServerOptions) {
  const { db, corsOrigin = true, idleRoomMs = 2 * 60 * 60 * 1000, exposeLan = false, hostsPerWindow } = options;

  const app = createApiApp({ db, corsOrigin, exposeLan, hostsPerWindow, roomCount: () => rooms.size });
  const httpServer = createServer(app);
  const io: GameIo = new Server(httpServer, { cors: { origin: corsOrigin } });
  const roomInfo = new Map<string, RoomInfo>();

  // Whenever a room changes, send its new state to every screen in that room.
  const rooms = new RoomManager((room) => {
    io.to(room.code).emit('room:state', room.toPublicState());
    if (room.currentPhase === 'finished') void saveResults(room);
  });

  /**
   * Runs once per connection, before any messages. Host screens send their
   * host key in the handshake. If it's valid we remember which host this
   * connection belongs to. Phones don't send one, and that's fine.
   */
  io.use(async (socket, next) => {
    const { hostKey } = (socket.handshake.auth ?? {}) as HandshakeAuth;
    if (typeof hostKey === 'string') {
      try {
        socket.data.hostId = (await findHostIdByKey(db, hostKey)) ?? undefined;
      } catch (error) {
        console.error('Host lookup failed', error);
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    // ── Host (TV screen) ──
    socket.on('host:create', (payload, ack) =>
      handle(ack, async () => {
        const hostId = socket.data.hostId;
        if (!hostId) return { ok: false, error: 'Reload the page to host a game' };
        const data = parse(hostCreatePayloadSchema, payload);
        if (!data.ok) return data;

        const { quizId } = data.value;
        const quiz: Quiz | null = quizId === SAMPLE_QUIZ_ID ? sampleQuiz : await getQuiz(db, quizId, hostId);
        if (!quiz) return { ok: false, error: "That quiz doesn't exist" };

        const room = rooms.create(quiz);
        roomInfo.set(room.code, { hostId, quizId: quizId === SAMPLE_QUIZ_ID ? null : quizId, resultsSaved: false });
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
    Object.assign(socket.data, { code: room.code, role, playerId });
    void socket.join(room.code);
    socket.emit('room:state', room.toPublicState());
  }

  function leaveRoom(socket: GameSocket) {
    const { code, role, playerId } = socket.data;
    if (!code) return;
    if (role === 'player' && playerId) rooms.get(code)?.detachSocket(playerId, socket.id);
    void socket.leave(code);
    // Forget the room, but keep hostId: that belongs to the connection, not the room.
    socket.data.code = socket.data.role = socket.data.playerId = undefined;
  }

  function hostRoom(socket: GameSocket): Room | undefined {
    const { role, code } = socket.data;
    return role === 'host' && code ? rooms.get(code) : undefined;
  }

  /** When a quiz finishes, save everyone's results so the host can look back at them. */
  async function saveResults(room: Room) {
    const info = roomInfo.get(room.code);
    if (!info || info.resultsSaved) return;
    info.resultsSaved = true; // set first, so a second change while saving doesn't save twice
    try {
      await saveGame(db, {
        hostId: info.hostId,
        quizId: info.quizId,
        quizTitle: room.quizTitle,
        roomCode: room.code,
        teams: room.finalStandings(),
      });
    } catch (error) {
      info.resultsSaved = false;
      console.error(`Could not save results for room ${room.code}`, error);
    }
  }

  const sweeper = setInterval(() => {
    for (const code of rooms.sweep(idleRoomMs)) roomInfo.delete(code);
  }, 60_000);
  sweeper.unref();
  httpServer.on('close', () => {
    clearInterval(sweeper);
    rooms.disposeAll();
  });

  return { httpServer, io, rooms, app };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Runs a request handler and always replies, even if it throws. An uncaught
 * error inside a socket handler would otherwise crash the whole server and end
 * every game.
 */
async function handle<T extends object>(ack: Ack<T>, fn: () => AckResult<T> | Promise<AckResult<T>>): Promise<void> {
  let result: AckResult<T>;
  try {
    result = await fn();
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
