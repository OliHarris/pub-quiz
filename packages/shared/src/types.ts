/**
 * The shapes of the data that travel between the game server and the screens.
 *
 * Both the server and the web app import these, so if one side changes a
 * shape, TypeScript flags the other side straight away.
 */

/** Where a room is in the game. The server moves it forward; screens just display it. */
export type Phase = 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'finished';

/** A question as the server stores it, including the answer. Never sent to players as-is. */
export interface Question {
  text: string;
  /** Between 2 and 4 options. */
  options: string[];
  /** Index into `options` of the right answer. */
  correctIndex: number;
  timeLimitSec: number;
}

export interface Quiz {
  title: string;
  questions: Question[];
}

/** What everyone in the room may know about a team. No secret token here. */
export interface PublicPlayer {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  /** Whether they have answered the current question (not what they answered). */
  hasAnswered: boolean;
}

/** The current question without its answer. */
export interface PublicQuestion {
  /** 0-based position in the quiz. */
  index: number;
  text: string;
  options: string[];
  timeLimitSec: number;
  /** When answers close, in milliseconds on the server's clock. */
  endsAt: number;
}

/** Sent once a question closes: the answer, how the room voted, and who scored what. */
export interface RevealInfo {
  correctIndex: number;
  /** How many teams picked each option, in option order. */
  answerCounts: number[];
  /** Points each team earned on this question, keyed by player id. */
  pointsThisQuestion: Record<string, number>;
}

/** Everything a screen needs to draw the room. The server broadcasts this on every change. */
export interface RoomState {
  code: string;
  phase: Phase;
  quizTitle: string;
  totalQuestions: number;
  /** 0-based index of the current (or most recent) question; -1 before the quiz starts. */
  questionIndex: number;
  players: PublicPlayer[];
  /** Present during the `question` and `reveal` phases. */
  question: PublicQuestion | null;
  /** Present during the `reveal` and `leaderboard` phases. */
  reveal: RevealInfo | null;
  /** The server's clock when this state was sent, so screens can correct for clock drift. */
  serverNow: number;
}
