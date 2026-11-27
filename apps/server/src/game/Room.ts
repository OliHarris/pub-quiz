import { randomUUID } from 'node:crypto';
import {
  MAX_PLAYERS_PER_ROOM,
  rankPlayers,
  type Phase,
  type PublicPlayer,
  type Quiz,
  type RevealInfo,
  type RoomState,
  type TeamResult,
} from '@pub-quiz/shared';
import { secretsMatch } from '../security';
import { scoreAnswer } from './scoring';

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** Answers that arrive this soon after the deadline still count, to allow for network lag. */
export const ANSWER_GRACE_MS = 500;

interface Answer {
  optionIndex: number;
  /** Server time the answer arrived. */
  receivedAt: number;
}

interface Player {
  id: string;
  /** Secret: only the team's own phone knows it. Lets them rejoin after a refresh. */
  token: string;
  name: string;
  score: number;
  /** Open connections for this team. Usually one; zero means their phone is offline. */
  sockets: Set<string>;
  /** Answers by question index. */
  answers: Map<number, Answer>;
}

/**
 * One game in progress. This is the single source of truth: phones and the TV
 * only ever display what the Room says ("server-authoritative").
 *
 * It knows nothing about WebSockets. It calls `onChange` whenever something
 * changes, and the network layer decides who to tell. Keeping the game rules
 * separate from the networking makes them easy to test.
 *
 *   lobby → question → reveal → leaderboard → question → … → finished
 */
export class Room {
  readonly hostToken = randomUUID();
  lastActivityAt = Date.now();

  private phase: Phase = 'lobby';
  private readonly players = new Map<string, Player>();
  private questionIndex = -1;
  private questionStartedAt = 0;
  private questionEndsAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private reveal: RevealInfo | null = null;

  constructor(
    readonly code: string,
    private readonly quiz: Quiz,
    private readonly onChange: (room: Room) => void,
  ) {}

  get currentPhase(): Phase {
    return this.phase;
  }

  get quizTitle(): string {
    return this.quiz.title;
  }

  /** Every team's final score and position, for saving once the quiz is over. */
  finalStandings(): TeamResult[] {
    return rankPlayers([...this.players.values()]).map(({ name, score, rank }) => ({ name, score, rank }));
  }

  // ─── Teams ──────────────────────────────────────────────────────────────

  addPlayer(name: string, socketId: string): Result<{ playerId: string; playerToken: string }> {
    if (this.phase === 'finished') return fail('This quiz has already finished');
    if (this.players.size >= MAX_PLAYERS_PER_ROOM) return fail('This room is full');
    const nameTaken = [...this.players.values()].some(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (nameTaken) return fail('That team name is taken');

    const player: Player = {
      id: randomUUID(),
      token: randomUUID(),
      name,
      score: 0,
      sockets: new Set([socketId]),
      answers: new Map(),
    };
    this.players.set(player.id, player);
    this.changed();
    return ok({ playerId: player.id, playerToken: player.token });
  }

  findPlayerByToken(token: string): { id: string; name: string } | undefined {
    for (const player of this.players.values()) {
      if (secretsMatch(player.token, token)) return { id: player.id, name: player.name };
    }
    return undefined;
  }

  /** A team's phone has (re)connected. */
  attachSocket(playerId: string, socketId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.sockets.add(socketId);
    this.changed();
  }

  /** A team's phone has gone away (locked screen, lost signal, closed tab). */
  detachSocket(playerId: string, socketId: string): void {
    const player = this.players.get(playerId);
    if (!player || !player.sockets.delete(socketId)) return;
    this.changed();
    // If everyone still connected has answered, there's no point waiting for this team.
    this.maybeCloseQuestionEarly();
  }

  /** What this team answered on the current question, so a reconnecting phone can show it. */
  currentAnswerFor(playerId: string): number | null {
    return this.players.get(playerId)?.answers.get(this.questionIndex)?.optionIndex ?? null;
  }

  // ─── Game flow ──────────────────────────────────────────────────────────

  start(): Result {
    if (this.phase !== 'lobby') return fail('The quiz has already started');
    if (this.players.size === 0) return fail('Wait for at least one team to join');
    this.beginQuestion(0);
    return ok(undefined);
  }

  /** The host's "next" button. What it does depends on where we are. */
  next(): Result {
    switch (this.phase) {
      case 'lobby':
        return this.start();
      case 'question':
        // The host can close a question early (say, if a team has gone to the bar).
        this.closeQuestion();
        return ok(undefined);
      case 'reveal':
        this.phase = 'leaderboard';
        this.changed();
        return ok(undefined);
      case 'leaderboard':
        if (this.questionIndex + 1 < this.quiz.questions.length) {
          this.beginQuestion(this.questionIndex + 1);
        } else {
          this.phase = 'finished';
          this.changed();
        }
        return ok(undefined);
      case 'finished':
        return fail('The quiz is over');
    }
  }

  submitAnswer(playerId: string, questionIndex: number, optionIndex: number): Result {
    const player = this.players.get(playerId);
    if (!player) return fail('Team not found');
    if (this.phase !== 'question' || questionIndex !== this.questionIndex) {
      return fail('Answers are closed for that question');
    }
    const question = this.quiz.questions[this.questionIndex];
    if (!question || optionIndex < 0 || optionIndex >= question.options.length) {
      return fail('That option does not exist');
    }
    if (player.answers.has(questionIndex)) return fail('You have already answered');
    const now = Date.now();
    if (now > this.questionEndsAt + ANSWER_GRACE_MS) return fail('Too late!');

    player.answers.set(questionIndex, { optionIndex, receivedAt: now });
    this.changed();
    this.maybeCloseQuestionEarly();
    return ok(undefined);
  }

  private beginQuestion(index: number): void {
    const question = this.quiz.questions[index];
    if (!question) return;
    this.phase = 'question';
    this.questionIndex = index;
    this.reveal = null;
    this.questionStartedAt = Date.now();
    const timeLimitMs = question.timeLimitSec * 1000;
    this.questionEndsAt = this.questionStartedAt + timeLimitMs;
    this.clearTimer();
    this.timer = setTimeout(() => this.closeQuestion(), timeLimitMs + ANSWER_GRACE_MS);
    this.changed();
  }

  /** Stop accepting answers, award points and move to the reveal. */
  private closeQuestion(): void {
    if (this.phase !== 'question') return;
    this.clearTimer();
    const question = this.quiz.questions[this.questionIndex];
    if (!question) return;

    const answerCounts = question.options.map(() => 0);
    const pointsThisQuestion: Record<string, number> = {};
    for (const player of this.players.values()) {
      const answer = player.answers.get(this.questionIndex);
      let points = 0;
      if (answer) {
        answerCounts[answer.optionIndex] = (answerCounts[answer.optionIndex] ?? 0) + 1;
        points = scoreAnswer(
          answer.optionIndex === question.correctIndex,
          answer.receivedAt - this.questionStartedAt,
          question.timeLimitSec * 1000,
        );
      }
      player.score += points;
      pointsThisQuestion[player.id] = points;
    }

    this.reveal = { correctIndex: question.correctIndex, answerCounts, pointsThisQuestion };
    this.phase = 'reveal';
    this.changed();
  }

  private maybeCloseQuestionEarly(): void {
    if (this.phase !== 'question') return;
    const connected = [...this.players.values()].filter((p) => p.sockets.size > 0);
    const everyoneAnswered =
      connected.length > 0 && connected.every((p) => p.answers.has(this.questionIndex));
    if (everyoneAnswered) this.closeQuestion();
  }

  // ─── Output ─────────────────────────────────────────────────────────────

  /** The room as screens see it. Answers stay secret until the reveal. */
  toPublicState(): RoomState {
    const showQuestion = this.phase === 'question' || this.phase === 'reveal';
    const question = showQuestion ? this.quiz.questions[this.questionIndex] : undefined;
    const players: PublicPlayer[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.sockets.size > 0,
      hasAnswered: this.phase === 'question' && p.answers.has(this.questionIndex),
    }));

    return {
      code: this.code,
      phase: this.phase,
      quizTitle: this.quiz.title,
      totalQuestions: this.quiz.questions.length,
      questionIndex: this.questionIndex,
      players,
      question: question
        ? {
            index: this.questionIndex,
            text: question.text,
            options: [...question.options],
            timeLimitSec: question.timeLimitSec,
            endsAt: this.questionEndsAt,
          }
        : null,
      reveal: this.phase === 'reveal' || this.phase === 'leaderboard' ? this.reveal : null,
      serverNow: Date.now(),
    };
  }

  /** Stop any timers so a closed room can be garbage-collected. */
  dispose(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private changed(): void {
    this.lastActivityAt = Date.now();
    this.onChange(this);
  }
}
