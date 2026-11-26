"use client";

import type { ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { RoomState } from "@pub-quiz/shared";
import { formatPoints, ordinal, rankPlayers } from "@/lib/ranking";
import { useCountdown } from "@/lib/useCountdown";
import { CountdownRing, OptionTile, PrimaryButton, RoomCode } from "../ui";

/**
 * The TV screen, one component per phase of the game. They only display
 * the room state; the game rules all live on the server.
 */

interface NextProps {
  onNext: () => void;
  busy: boolean;
}

/** The bottom bar: a status on the left, the host's "next" button on the right. */
function Footer({ left, label, onNext, busy, disabled }: NextProps & { left?: ReactNode; label: string; disabled?: boolean }) {
  return (
    <footer className="mt-[2vw] flex items-center justify-between gap-6">
      <div className="text-[clamp(1rem,1.5vw,1.75rem)] text-chalk-dim">{left}</div>
      <div className="flex items-center gap-4">
        <span className="hidden text-sm text-chalk-dim lg:inline">
          or press <kbd className="rounded-md border border-chalk-dim/40 px-2 py-0.5 font-sans">Space</kbd>
        </span>
        <PrimaryButton onClick={onNext} disabled={busy || disabled} className="text-[clamp(1rem,1.4vw,1.6rem)]">
          {label} →
        </PrimaryButton>
      </div>
    </footer>
  );
}

// ─── Lobby ──────────────────────────────────────────────────────────────────

export function HostLobby({ room, joinUrl, ...next }: NextProps & { room: RoomState; joinUrl: string | null }) {
  const count = room.players.length;
  return (
    <>
      <div className="grid flex-1 items-center gap-[3vw] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="flex flex-col items-center gap-[1.5vw] rounded-[2rem] bg-felt-light p-[2.5vw] text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-chalk-dim">Scan to join</p>
          <div className="aspect-square w-[min(22vw,320px)] min-w-40 rounded-2xl bg-chalk p-3">
            {joinUrl ? (
              <QRCodeSVG
                value={joinUrl}
                size={256}
                bgColor="#f6efe0"
                fgColor="#0f1f1a"
                marginSize={1}
                title="QR code to join the game"
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <div className="size-full animate-pulse-soft rounded-xl bg-chalk-dim/30" />
            )}
          </div>
          <p className="text-[clamp(0.95rem,1.3vw,1.5rem)] text-chalk-dim">
            or go to <strong className="text-chalk">{joinUrl ? displayHost(joinUrl) : "…"}</strong> and enter
          </p>
          <RoomCode code={room.code} />
        </section>

        <section className="flex h-full flex-col gap-[1.5vw] py-[1vw]">
          <h2 className="flex items-baseline gap-4 font-display text-[clamp(1.75rem,3vw,3.5rem)] font-bold">
            Teams
            <span className="rounded-full bg-brass px-4 text-[0.6em] text-felt">{count}</span>
          </h2>
          {count === 0 ? (
            <p className="animate-pulse-soft text-[clamp(1.1rem,1.8vw,2rem)] text-chalk-dim">
              Waiting for the first team to join…
            </p>
          ) : (
            <ul className="flex flex-wrap content-start gap-[0.8vw]">
              {room.players.map((player) => (
                <li
                  key={player.id}
                  className={`animate-pop rounded-full bg-felt-lighter px-[1.4vw] py-[0.6vw] text-[clamp(1rem,1.7vw,2rem)] font-semibold ${
                    player.connected ? "" : "opacity-45"
                  }`}
                >
                  {player.name}
                  {!player.connected && <span className="sr-only"> (offline)</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <Footer
        {...next}
        label="Start the quiz"
        disabled={count === 0}
        left={count === 0 ? "You need at least one team to start" : `${room.totalQuestions} questions ready`}
      />
    </>
  );
}

function displayHost(url: string): string {
  const { host } = new URL(url);
  return host;
}

// ─── Question and reveal ──────────────────────────────────────────────────

export function HostQuestion({ room, clockOffset, ...next }: NextProps & { room: RoomState; clockOffset: number }) {
  const question = room.question!;
  const reveal = room.phase === "reveal" ? room.reveal : null;
  const msLeft = useCountdown(reveal ? undefined : question.endsAt, clockOffset);
  const connected = room.players.filter((p) => p.connected);
  const answered = connected.filter((p) => p.hasAnswered).length;

  return (
    <>
      <div className="flex flex-1 flex-col gap-[2.5vw]">
        <div className="flex items-start justify-between gap-[3vw]">
          <div className="flex flex-col gap-[1vw]">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-chalk-dim">
              Question {question.index + 1} of {room.totalQuestions}
            </p>
            <h1 className="font-display text-[clamp(1.75rem,4vw,4.75rem)] leading-[1.1] font-bold text-balance">
              {question.text}
            </h1>
          </div>
          {!reveal && <CountdownRing msLeft={msLeft} totalMs={question.timeLimitSec * 1000} className="size-[9vw] min-w-20" />}
        </div>

        <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-[1.5vw]">
          {question.options.map((option, i) => (
            <OptionTile
              key={i}
              index={i}
              text={option}
              tone={reveal ? (i === reveal.correctIndex ? "correct" : "faded") : "idle"}
              count={reveal ? reveal.answerCounts[i] : undefined}
            />
          ))}
        </div>
      </div>

      {reveal ? (
        <Footer {...next} label="Show scores" left={revealSummary(room)} />
      ) : (
        <Footer
          {...next}
          label="Close answers"
          left={
            <span className="flex items-center gap-4">
              <span className="flex gap-1.5" aria-hidden>
                {connected.map((p) => (
                  <span key={p.id} className={`size-3 rounded-full ${p.hasAnswered ? "bg-brass" : "bg-felt-lighter"}`} />
                ))}
              </span>
              {answered} of {connected.length} teams answered
            </span>
          }
        />
      )}
    </>
  );
}

function revealSummary(room: RoomState): string {
  const points = room.reveal?.pointsThisQuestion ?? {};
  const right = room.players.filter((p) => (points[p.id] ?? 0) > 0).length;
  if (right === 0) return "Nobody got that one!";
  if (right === room.players.length) return "Everyone got it right!";
  return `${right} of ${room.players.length} teams got it right`;
}

// ─── Leaderboard ────────────────────────────────────────────────────────────

export function HostLeaderboard({ room, ...next }: NextProps & { room: RoomState }) {
  const ranked = rankPlayers(room.players);
  const points = room.reveal?.pointsThisQuestion ?? {};
  const isLast = room.questionIndex + 1 >= room.totalQuestions;

  return (
    <>
      <div className="flex flex-1 flex-col gap-[2vw]">
        <h1 className="font-display text-[clamp(1.75rem,3.5vw,4rem)] font-bold">
          Scores after question {room.questionIndex + 1}
          <span className="text-chalk-dim"> of {room.totalQuestions}</span>
        </h1>
        <ol data-testid="leaderboard" className="flex flex-col gap-[0.8vw]">
          {ranked.slice(0, 8).map((player, i) => (
            <li
              key={player.id}
              style={{ animationDelay: `${i * 70}ms` }}
              className={`grid animate-rise grid-cols-[4vw_1fr_auto_auto] items-center gap-[1.5vw] rounded-2xl px-[1.5vw] py-[0.9vw] text-[clamp(1.1rem,2vw,2.4rem)] ${
                player.rank === 1 ? "bg-brass text-felt" : "bg-felt-light"
              }`}
            >
              <span className="font-display font-bold">{ordinal(player.rank)}</span>
              <span className="truncate font-semibold">{player.name}</span>
              <span className={`text-[0.7em] font-semibold ${player.rank === 1 ? "" : "text-right"}`}>
                {(points[player.id] ?? 0) > 0 ? `+${formatPoints(points[player.id]!)}` : ""}
              </span>
              <span className="font-display font-bold tabular-nums">{formatPoints(player.score)}</span>
            </li>
          ))}
        </ol>
        {ranked.length > 8 && <p className="text-chalk-dim">…and {ranked.length - 8} more teams</p>}
      </div>
      <Footer {...next} label={isLast ? "Final results" : "Next question"} />
    </>
  );
}

// ─── Finished ───────────────────────────────────────────────────────────────

export function HostFinished({ room, onNewGame }: { room: RoomState; onNewGame: () => void }) {
  const ranked = rankPlayers(room.players);
  const podium = [ranked[1], ranked[0], ranked[2]]; // 2nd, 1st, 3rd: winner in the middle
  const heights = ["h-[14vw]", "h-[20vw]", "h-[10vw]"];

  return (
    <div className="flex flex-1 flex-col items-center gap-[2vw]">
      <h1 className="font-display text-[clamp(2rem,4.5vw,5rem)] font-bold">Final scores</h1>
      <div className="flex flex-1 items-end justify-center gap-[1.5vw]">
        {podium.map((player, i) =>
          player ? (
            <div key={player.id} className="flex w-[18vw] flex-col items-center gap-[0.8vw] text-center">
              <span className="font-display text-[clamp(1.1rem,2vw,2.4rem)] font-bold text-balance">{player.name}</span>
              <span className="text-[clamp(1rem,1.5vw,1.75rem)] text-chalk-dim tabular-nums">
                {formatPoints(player.score)} pts
              </span>
              <div
                style={{ animationDelay: `${[400, 900, 0][i]}ms` }}
                className={`${heights[i]} w-full animate-rise rounded-t-2xl ${i === 1 ? "bg-brass text-felt" : "bg-felt-lighter"} grid place-items-start justify-center pt-[1vw] font-display text-[4vw] font-bold`}
              >
                {ordinal(player.rank)}
              </div>
            </div>
          ) : (
            <div key={i} className="w-[18vw]" />
          ),
        )}
      </div>
      {ranked.length > 3 && (
        <p className="text-[clamp(1rem,1.5vw,1.75rem)] text-chalk-dim">
          {ranked
            .slice(3, 10)
            .map((p) => `${ordinal(p.rank)} ${p.name}`)
            .join("  ·  ")}
        </p>
      )}
      <PrimaryButton onClick={onNewGame}>Host another quiz</PrimaryButton>
    </div>
  );
}
