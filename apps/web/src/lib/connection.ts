import { io, type Socket } from "socket.io-client";
import type { AckResult, ClientToServerEvents, HandshakeAuth, RoomState, ServerToClientEvents } from "@pub-quiz/shared";
import { getHostKey } from "./api";
import { gameServerUrl } from "./config";

export { gameServerUrl };

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

export interface ConnectionSnapshot {
  status: ConnectionStatus;
  /** The latest room state pushed by the server, or null before we've joined one. */
  room: RoomState | null;
  /** How far the server's clock is ahead of this device's (ms). Keeps countdowns in sync. */
  clockOffset: number;
}

const INITIAL: ConnectionSnapshot = { status: "connecting", room: null, clockOffset: 0 };

/**
 * Owns the WebSocket connection and the latest room state, outside React.
 *
 * React components subscribe to it with `useSyncExternalStore` (see
 * useGameConnection). Keeping the socket out of component state means a
 * re-render can never accidentally open a second connection.
 */
export class GameConnection {
  private socket: GameSocket | null = null;
  private snapshot: ConnectionSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => INITIAL;

  /**
   * Connect. `onConnect` runs on the first connection and again after every reconnect.
   * Host screens (`asHost`) prove who they are by sending their host key in the handshake.
   */
  start(onConnect: (socket: GameSocket) => void, { asHost = false } = {}): void {
    const socket: GameSocket = io(gameServerUrl(), {
      // Go straight to WebSockets rather than starting with slower HTTP polling.
      // It also means that later, several copies of the server won't need "sticky sessions".
      transports: ["websocket"],
      autoConnect: false,
      // A function, so it runs again on every reconnect and always sends the current key.
      auth: asHost
        ? (send: (auth: HandshakeAuth) => void) => {
            getHostKey().then((hostKey) => send({ hostKey }), () => send({}));
          }
        : undefined,
    });
    this.socket = socket;

    socket.on("connect", () => {
      this.update({ status: "connected" });
      onConnect(socket);
    });
    socket.on("disconnect", () => this.update({ status: "reconnecting" }));
    socket.on("connect_error", () => this.update({ status: "reconnecting" }));
    socket.on("room:state", (room) => {
      this.update({ room, clockOffset: room.serverNow - Date.now() });
    });
    socket.connect();
  }

  stop(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  /** The live socket, for sending messages. */
  get io(): GameSocket {
    if (!this.socket) throw new Error("Not connected");
    return this.socket;
  }

  private update(patch: Partial<ConnectionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}

/** Waits for the server's reply, turning a timeout or dropped connection into a normal error. */
export async function request<T extends object>(
  send: () => Promise<AckResult<T>>,
): Promise<AckResult<T>> {
  try {
    return await send();
  } catch {
    return { ok: false, error: "Couldn't reach the game server. Check your connection." };
  }
}

export const REQUEST_TIMEOUT_MS = 5000;
