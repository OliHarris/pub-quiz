"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { roomCodeSchema } from "@pub-quiz/shared";
import { request, REQUEST_TIMEOUT_MS } from "@/lib/connection";
import { playerSessionKey, readJson, removeItem, writeJson, type PlayerSession } from "@/lib/storage";
import { useGameConnection } from "@/lib/useGameConnection";
import { ConnectionDot, Logo, Splash, Toast } from "../ui";
import { JoinForm, PlayerLobby, PlayerQuestion, PlayerReveal, PlayerStanding, type Me } from "./PlayerViews";

/**
 * A team's phone. It joins a room (or quietly rejoins after a refresh or
 * locked screen), then shows whatever the room's phase calls for.
 */
export function PlayerScreen({ code: rawCode }: { code: string }) {
  const parsedCode = roomCodeSchema.safeParse(rawCode);
  const code = parsedCode.success ? parsedCode.data : rawCode;

  const [stage, setStage] = useState<"checking" | "join" | "playing">("checking");
  const [me, setMe] = useState<Me | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** My answer for each question, by question index. */
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);

  const { connection, status, room, clockOffset } = useGameConnection(async (socket, conn) => {
    if (!parsedCode.success) return;
    const saved = readJson<PlayerSession>(playerSessionKey(code));
    if (saved) {
      const resumed = await request(() =>
        socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck("player:resume", { code, playerToken: saved.playerToken }),
      );
      if (resumed.ok) {
        setMe({ playerId: resumed.playerId, name: resumed.name });
        const questionIndex = conn.getSnapshot().room?.question?.index;
        if (resumed.answerIndex !== null && questionIndex !== undefined) {
          setAnswers((previous) => ({ ...previous, [questionIndex]: resumed.answerIndex! }));
        }
        setStage("playing");
        return;
      }
      removeItem(playerSessionKey(code));
      setNotice("We couldn't find your team. That game may have ended.");
      setMe(null);
    }
    setStage("join");
  });

  async function join(name: string): Promise<string | null> {
    const joined = await request(() =>
      connection.io.timeout(REQUEST_TIMEOUT_MS).emitWithAck("player:join", { code, name }),
    );
    if (!joined.ok) return joined.error;
    writeJson(playerSessionKey(code), { playerToken: joined.playerToken });
    setMe({ playerId: joined.playerId, name });
    setStage("playing");
    return null;
  }

  async function answer(questionIndex: number, optionIndex: number) {
    if (answers[questionIndex] !== undefined) return;
    // Show the choice straight away ("optimistic update"), then undo it if the server says no.
    setAnswers((previous) => ({ ...previous, [questionIndex]: optionIndex }));
    navigator.vibrate?.(30);
    const result = await request(() =>
      connection.io.timeout(REQUEST_TIMEOUT_MS).emitWithAck("player:answer", { questionIndex, optionIndex }),
    );
    if (!result.ok) {
      setAnswers((previous) => {
        const next = { ...previous };
        delete next[questionIndex];
        return next;
      });
      setError(result.error);
    }
  }

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(id);
  }, [error]);

  if (!parsedCode.success) {
    return (
      <Splash title="That room code doesn't look right" detail="Room codes are 4 letters, shown on the TV screen.">
        <Link href="/" className="text-brass underline underline-offset-4">
          Try another code
        </Link>
      </Splash>
    );
  }
  if (stage === "checking") {
    return <Splash title={status === "reconnecting" ? "Can't reach the game" : "Connecting…"} />;
  }
  if (stage === "join" || !me) {
    return <JoinForm code={code} notice={notice} onJoin={join} />;
  }
  if (!room) return <Splash title="Connecting…" />;

  const currentAnswer = room.question ? answers[room.question.index] : undefined;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-felt-lighter px-5 py-3">
        <Logo className="text-base text-brass" />
        <span className="truncate font-semibold">{me.name}</span>
        <ConnectionDot status={status} />
      </header>

      {room.phase === "lobby" && <PlayerLobby me={me} room={room} />}
      {room.phase === "question" && (
        <PlayerQuestion room={room} clockOffset={clockOffset} myAnswer={currentAnswer} onAnswer={answer} />
      )}
      {room.phase === "reveal" && <PlayerReveal room={room} me={me} myAnswer={currentAnswer} />}
      {(room.phase === "leaderboard" || room.phase === "finished") && <PlayerStanding room={room} me={me} />}

      {error && <Toast>{error}</Toast>}
    </div>
  );
}
