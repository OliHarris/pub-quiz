"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { gameServerUrl, request, REQUEST_TIMEOUT_MS, type GameSocket } from "@/lib/connection";
import { HOST_SESSION_KEY, readJson, removeItem, writeJson, type HostSession } from "@/lib/storage";
import { useGameConnection } from "@/lib/useGameConnection";
import { ConnectionDot, Logo, Splash, Toast } from "../ui";
import { HostFinished, HostLeaderboard, HostLobby, HostQuestion } from "./HostViews";

/**
 * The host's screen, meant for a TV or projector. It creates a room (or
 * reconnects to the one it already had) and shows the right view for each
 * phase of the game.
 */
export function HostScreen() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const { connection, status, room, clockOffset } = useGameConnection(async (socket) => {
    // After a refresh or a dropped connection, carry on with the same game.
    const saved = readJson<HostSession>(HOST_SESSION_KEY);
    if (saved) {
      const resumed = await request(() => socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck("host:resume", saved));
      if (resumed.ok) return;
      removeItem(HOST_SESSION_KEY);
    }
    await createRoom(socket);
  });

  const joinUrl = useJoinUrl(room?.code);

  async function createRoom(socket: GameSocket) {
    const created = await request(() => socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck("host:create"));
    if (created.ok) writeJson(HOST_SESSION_KEY, { code: created.code, hostToken: created.hostToken });
    else setError(created.error);
  }

  async function advance() {
    if (!room || busyRef.current || room.phase === "finished") return;
    if (room.phase === "lobby" && room.players.length === 0) return;
    busyRef.current = true;
    setBusy(true);
    const socket = connection.io;
    const result = await request(() =>
      room.phase === "lobby"
        ? socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck("host:start")
        : socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck("host:next"),
    );
    busyRef.current = false;
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  function startNewGame() {
    removeItem(HOST_SESSION_KEY);
    void createRoom(connection.io);
  }

  // Space, Enter or → moves the game on, so the host can run it from a keyboard.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const onButton = event.target instanceof HTMLButtonElement;
    const isNextKey = event.key === "ArrowRight" || (!onButton && (event.key === " " || event.key === "Enter"));
    if (!isNextKey) return;
    event.preventDefault();
    void advance();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error]);

  if (!room) {
    return status === "reconnecting" ? (
      <Splash
        title="Can't reach the game server"
        detail="Make sure it's running (npm run dev starts it). This page will connect as soon as it's up."
      />
    ) : (
      <Splash title="Opening the doors…" />
    );
  }

  const nextProps = { onNext: () => void advance(), busy };

  return (
    <div className="flex min-h-dvh flex-col px-[3vw] py-[2vw]">
      <header className="mb-[2vw] flex items-center justify-between gap-6">
        <div className="flex items-baseline gap-4">
          <Logo className="text-[clamp(1.1rem,1.6vw,1.9rem)] text-brass" />
          <span className="text-[clamp(1rem,1.4vw,1.6rem)] text-chalk-dim">{room.quizTitle}</span>
        </div>
        <ConnectionDot status={status} />
      </header>

      <main className="flex flex-1 flex-col">
        {room.phase === "lobby" && <HostLobby room={room} joinUrl={joinUrl} {...nextProps} />}
        {(room.phase === "question" || room.phase === "reveal") && (
          <HostQuestion room={room} clockOffset={clockOffset} {...nextProps} />
        )}
        {room.phase === "leaderboard" && <HostLeaderboard room={room} {...nextProps} />}
        {room.phase === "finished" && <HostFinished room={room} onNewGame={startNewGame} />}
      </main>

      {error && <Toast>{error}</Toast>}
    </div>
  );
}

/**
 * The link the QR code points to. Phones can't open "localhost" (to a phone,
 * that's the phone), so during development we ask the game server for this
 * computer's Wi-Fi address instead.
 */
function useJoinUrl(code: string | undefined): string | null {
  const [base, setBase] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveJoinBase().then((url) => {
      if (!cancelled) setBase(url);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return base && code ? `${base}/play/${code}` : null;
}

async function resolveJoinBase(): Promise<string> {
  const { hostname, protocol, port, origin } = window.location;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") return origin;
  try {
    const response = await fetch(`${gameServerUrl()}/lan`);
    const { addresses } = (await response.json()) as { addresses?: string[] };
    const ip = addresses?.[0];
    return ip ? `${protocol}//${ip}${port ? `:${port}` : ""}` : origin;
  } catch {
    return origin;
  }
}
