"use client";

import { useActionState } from "react";
import Link from "next/link";
import { teamNameSchema, TEAM_NAME_MAX_LENGTH, type RoomState } from "@pub-quiz/shared";
import { formatPoints, ordinal, rankPlayers } from "@/lib/ranking";
import { useCountdown } from "@/lib/useCountdown";
import { OPTION_LETTERS, OptionTile, PrimaryButton, RoomCode } from "../ui";

/** The phone screens, one component per phase. Big tap targets, very little reading. */

export interface Me {
  playerId: string;
  name: string;
}

// ─── Joining ────────────────────────────────────────────────────────────────

interface JoinState {
  error: string | null;
  name: string;
}

/**
 * Uses a React 19 form action: React tracks the pending state and the result
 * for us, so there's no manual "loading" boolean.
 */
export function JoinForm({
  code,
  notice,
  onJoin,
}: {
  code: string;
  notice: string | null;
  onJoin: (name: string) => Promise<string | null>;
}) {
  const [state, formAction, pending] = useActionState<JoinState, FormData>(
    async (_previous, formData) => {
      const name = String(formData.get("name") ?? "");
      const parsed = teamNameSchema.safeParse(name);
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid name", name };
      return { error: await onJoin(parsed.data), name };
    },
    { error: notice, name: "" },
  );

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-5 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-chalk-dim">Joining room</p>
        <RoomCode code={code} size="phone" />
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        <label htmlFor="team-name" className="font-display text-2xl font-bold">
          Team name
        </label>
        <input
          id="team-name"
          name="name"
          defaultValue={state.name}
          maxLength={TEAM_NAME_MAX_LENGTH}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="go"
          placeholder="e.g. The Quizzly Bears"
          className="rounded-2xl border-2 border-felt-lighter bg-felt-light px-5 py-4 text-xl text-chalk placeholder:text-chalk-dim/60 focus:border-brass focus:outline-none"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "join-error" : undefined}
        />
        {state.error && (
          <p id="join-error" role="alert" className="font-semibold text-incorrect">
            {state.error}
          </p>
        )}
        <PrimaryButton type="submit" disabled={pending} className="mt-2 py-4 text-xl">
          {pending ? "Joining…" : "Join"}
        </PrimaryButton>
      </form>
    </main>
  );
}

// ─── Lobby ──────────────────────────────────────────────────────────────────

export function PlayerLobby({ me, room }: { me: Me; room: RoomState }) {
  const others = room.players.length - 1;
  return (
    <Centered>
      <p className="animate-pop text-6xl" aria-hidden>
        🎉
      </p>
      <h1 className="font-display text-4xl font-bold">You&apos;re in!</h1>
      <p className="text-xl">
        Playing as <strong className="text-brass">{me.name}</strong>
      </p>
      <p className="text-chalk-dim">
        Look up at the screen. The quiz starts soon.
        <br />
        {others === 0 ? "You're the first team here." : `${others} other ${others === 1 ? "team has" : "teams have"} joined.`}
      </p>
    </Centered>
  );
}

// ─── Question ───────────────────────────────────────────────────────────────

export function PlayerQuestion({
  room,
  clockOffset,
  myAnswer,
  onAnswer,
}: {
  room: RoomState;
  clockOffset: number;
  myAnswer: number | undefined;
  onAnswer: (questionIndex: number, optionIndex: number) => void;
}) {
  const question = room.question!;
  const msLeft = useCountdown(question.endsAt, clockOffset);
  const timeUp = msLeft === 0;

  if (myAnswer !== undefined) {
    return (
      <Centered>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-chalk-dim">Locked in</p>
        <div className="w-full animate-pop">
          <OptionTile index={myAnswer} text={question.options[myAnswer] ?? ""} tone="chosen" size="phone" />
        </div>
        <p className="animate-pulse-soft text-chalk-dim">Waiting for the other teams…</p>
      </Centered>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pt-4 pb-8">
      <div
        className="h-2 overflow-hidden rounded-full bg-felt-lighter"
        role="progressbar"
        aria-label="Time left"
        aria-valuenow={Math.ceil(msLeft / 1000)}
        aria-valuemin={0}
        aria-valuemax={question.timeLimitSec}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-100 ease-linear ${msLeft < 5000 ? "bg-opt-c" : "bg-brass"}`}
          style={{ width: `${(msLeft / (question.timeLimitSec * 1000)) * 100}%` }}
        />
      </div>
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-chalk-dim">
        Question {question.index + 1} of {room.totalQuestions}
      </p>
      <h1 className="font-display text-2xl leading-snug font-bold text-balance">{question.text}</h1>
      <div className="mt-auto flex flex-col gap-3">
        {question.options.map((option, i) => (
          <OptionTile
            key={i}
            index={i}
            text={option}
            size="phone"
            disabled={timeUp}
            onClick={() => onAnswer(question.index, i)}
          />
        ))}
      </div>
      {timeUp && <p className="text-center font-semibold text-opt-c">Time&apos;s up!</p>}
    </main>
  );
}

// ─── Reveal ─────────────────────────────────────────────────────────────────

export function PlayerReveal({ room, me, myAnswer }: { room: RoomState; me: Me; myAnswer: number | undefined }) {
  const reveal = room.reveal!;
  const question = room.question!;
  const points = reveal.pointsThisQuestion[me.playerId] ?? 0;
  const correctText = `${OPTION_LETTERS[reveal.correctIndex]}: ${question.options[reveal.correctIndex]}`;

  if (myAnswer === reveal.correctIndex) {
    return (
      <Centered>
        <div className="grid size-28 animate-pop place-items-center rounded-full bg-correct text-6xl text-felt">✓</div>
        <h1 className="font-display text-4xl font-bold">Correct!</h1>
        <p className="font-display text-3xl text-correct">+{formatPoints(points)}</p>
      </Centered>
    );
  }
  return (
    <Centered>
      <div className="grid size-28 animate-pop place-items-center rounded-full bg-felt-lighter text-5xl">
        {myAnswer === undefined ? "⏱" : "✗"}
      </div>
      <h1 className="font-display text-4xl font-bold">{myAnswer === undefined ? "Too slow!" : "Not this time"}</h1>
      <p className="text-lg text-chalk-dim">
        The answer was <strong className="text-chalk">{correctText}</strong>
      </p>
    </Centered>
  );
}

// ─── Scores ─────────────────────────────────────────────────────────────────

export function PlayerStanding({ room, me }: { room: RoomState; me: Me }) {
  const ranked = rankPlayers(room.players);
  const mine = ranked.find((p) => p.id === me.playerId);
  const finished = room.phase === "finished";
  if (!mine) return null;

  return (
    <Centered>
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-chalk-dim">
        {finished ? "Final position" : "You're currently"}
      </p>
      <p className={`animate-pop font-display text-7xl font-bold ${mine.rank === 1 ? "text-brass" : ""}`}>
        {ordinal(mine.rank)}
      </p>
      <p className="text-lg text-chalk-dim">of {ranked.length} {ranked.length === 1 ? "team" : "teams"}</p>
      <p className="font-display text-3xl tabular-nums">{formatPoints(mine.score)} pts</p>
      {finished && (
        <>
          <p className="mt-4 text-xl">{mine.rank === 1 ? "🏆 Champions! Drinks are on you." : "Thanks for playing!"}</p>
          <Link href="/" className="text-brass underline underline-offset-4">
            Back to the start
          </Link>
        </>
      )}
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-5 py-10 text-center">
      {children}
    </main>
  );
}
