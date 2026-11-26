import type { RoomState } from './types';

/**
 * The "contract" for the WebSocket connection: every message a screen can send
 * to the server, and every message the server can push back.
 *
 * Socket.IO uses these interfaces to type-check `socket.emit(...)` and
 * `socket.on(...)` on both sides.
 */

/** Every request gets a reply through an acknowledgement callback ("ack"). */
export type AckResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
export type Ack<T extends object = object> = (result: AckResult<T>) => void;

export interface ClientToServerEvents {
  /** The TV screen asks for a new room. */
  'host:create': (ack: Ack<{ code: string; hostToken: string }>) => void;
  /** The TV screen reconnects (after a refresh or Wi-Fi blip) using its secret host token. */
  'host:resume': (payload: { code: string; hostToken: string }, ack: Ack) => void;
  /** The host starts the quiz. */
  'host:start': (ack: Ack) => void;
  /** The host moves the game on: close the question, show scores, next question... */
  'host:next': (ack: Ack) => void;

  /** A phone joins a room as a new team. */
  'player:join': (
    payload: { code: string; name: string },
    ack: Ack<{ playerId: string; playerToken: string }>,
  ) => void;
  /** A phone reconnects as an existing team using its secret player token. */
  'player:resume': (
    payload: { code: string; playerToken: string },
    ack: Ack<{ playerId: string; name: string; answerIndex: number | null }>,
  ) => void;
  /** A phone locks in an answer. */
  'player:answer': (payload: { questionIndex: number; optionIndex: number }, ack: Ack) => void;
}

export interface ServerToClientEvents {
  /** The full room state, pushed to everyone in the room whenever anything changes. */
  'room:state': (state: RoomState) => void;
}

/** Extra data the server remembers about each connection. */
export interface SocketData {
  code?: string;
  role?: 'host' | 'player';
  playerId?: string;
}
