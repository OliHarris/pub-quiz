export const BASE_POINTS = 500;
export const MAX_SPEED_BONUS = 500;

/**
 * Points for one answer: a right answer earns 500, plus up to 500 more for
 * speed. The bonus shrinks steadily from 500 (instant) to 0 (on the buzzer).
 *
 * The time is measured when the server *receives* the answer, never by the
 * phone, so nobody can cheat by faking their clock.
 */
export function scoreAnswer(correct: boolean, msTaken: number, timeLimitMs: number): number {
  if (!correct) return 0;
  const fractionLeft = 1 - Math.min(Math.max(msTaken, 0), timeLimitMs) / timeLimitMs;
  return BASE_POINTS + Math.round(MAX_SPEED_BONUS * fractionLeft);
}
