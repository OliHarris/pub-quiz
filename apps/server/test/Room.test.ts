import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Quiz } from '@pub-quiz/shared';
import { ANSWER_GRACE_MS, Room } from '../src/game/Room';

const quiz: Quiz = {
  title: 'Test Quiz',
  questions: [
    { text: 'Q1?', options: ['A', 'B', 'C', 'D'], correctIndex: 1, timeLimitSec: 10 },
    { text: 'Q2?', options: ['True', 'False'], correctIndex: 0, timeLimitSec: 10 },
  ],
};

function makeRoom() {
  const onChange = vi.fn();
  const room = new Room('BCDF', quiz, onChange);
  return { room, onChange };
}

/** Adds a team and returns its id, failing the test if the join is rejected. */
function join(room: Room, name: string, socketId = `socket-${name}`): string {
  const result = room.addPlayer(name, socketId);
  if (!result.ok) throw new Error(result.error);
  return result.value.playerId;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-12-01T20:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('joining', () => {
  it('adds teams and tells listeners', () => {
    const { room, onChange } = makeRoom();
    join(room, 'The Quizzly Bears');
    const state = room.toPublicState();
    expect(state.players).toHaveLength(1);
    expect(state.players[0]).toMatchObject({ name: 'The Quizzly Bears', score: 0, connected: true });
    expect(onChange).toHaveBeenCalled();
  });

  it('rejects a duplicate team name, ignoring case', () => {
    const { room } = makeRoom();
    join(room, 'Tequila Mockingbird');
    expect(room.addPlayer('tequila mockingbird', 's2')).toEqual({ ok: false, error: 'That team name is taken' });
  });

  it('never exposes secret tokens in the public state', () => {
    const { room } = makeRoom();
    const result = room.addPlayer('Les Quizerables', 's1');
    if (!result.ok) throw new Error(result.error);
    const json = JSON.stringify(room.toPublicState());
    expect(json).not.toContain(result.value.playerToken);
    expect(json).not.toContain(room.hostToken);
  });

  it('finds a team again by its token, for reconnecting', () => {
    const { room } = makeRoom();
    const result = room.addPlayer('Les Quizerables', 's1');
    if (!result.ok) throw new Error(result.error);
    expect(room.findPlayerByToken(result.value.playerToken)).toEqual({
      id: result.value.playerId,
      name: 'Les Quizerables',
    });
    expect(room.findPlayerByToken('not-the-right-token')).toBeUndefined();
  });

  it('marks a team offline when its phone disconnects, and back online when it returns', () => {
    const { room } = makeRoom();
    const id = join(room, 'Bears', 's1');
    room.detachSocket(id, 's1');
    expect(room.toPublicState().players[0]?.connected).toBe(false);
    room.attachSocket(id, 's2');
    expect(room.toPublicState().players[0]?.connected).toBe(true);
  });
});

describe('starting', () => {
  it('needs at least one team', () => {
    const { room } = makeRoom();
    expect(room.start()).toEqual({ ok: false, error: 'Wait for at least one team to join' });
  });

  it('shows the first question without revealing the answer', () => {
    const { room } = makeRoom();
    join(room, 'Bears');
    expect(room.start().ok).toBe(true);
    const state = room.toPublicState();
    expect(state.phase).toBe('question');
    expect(state.question).toMatchObject({ index: 0, text: 'Q1?', options: ['A', 'B', 'C', 'D'] });
    expect(state.question?.endsAt).toBe(Date.now() + 10_000);
    expect(state.reveal).toBeNull();
    expect(JSON.stringify(state)).not.toContain('correctIndex');
  });
});

describe('answering', () => {
  it('scores right answers by speed and wrong answers as zero', () => {
    const { room } = makeRoom();
    const fast = join(room, 'Fast');
    const slow = join(room, 'Slow');
    const wrong = join(room, 'Wrong');
    room.start();

    expect(room.submitAnswer(fast, 0, 1).ok).toBe(true); // instantly, correct
    vi.advanceTimersByTime(5_000);
    expect(room.submitAnswer(slow, 0, 1).ok).toBe(true); // half time left, correct
    expect(room.submitAnswer(wrong, 0, 3).ok).toBe(true); // wrong

    const state = room.toPublicState();
    expect(state.phase).toBe('reveal'); // everyone answered, so it closed early
    expect(state.reveal?.correctIndex).toBe(1);
    expect(state.reveal?.answerCounts).toEqual([0, 2, 0, 1]);
    expect(state.reveal?.pointsThisQuestion).toEqual({ [fast]: 1000, [slow]: 750, [wrong]: 0 });
  });

  it('only accepts one answer per team', () => {
    const { room } = makeRoom();
    const a = join(room, 'A');
    join(room, 'B');
    room.start();
    room.submitAnswer(a, 0, 1);
    expect(room.submitAnswer(a, 0, 2)).toEqual({ ok: false, error: 'You have already answered' });
  });

  it('rejects answers for the wrong question or a missing option', () => {
    const { room } = makeRoom();
    const a = join(room, 'A');
    room.start();
    expect(room.submitAnswer(a, 1, 0).ok).toBe(false);
    expect(room.submitAnswer(a, 0, 4).ok).toBe(false);
  });

  it('shows who has answered, but not what they answered', () => {
    const { room } = makeRoom();
    const a = join(room, 'A');
    join(room, 'B');
    room.start();
    room.submitAnswer(a, 0, 2);
    const players = room.toPublicState().players;
    expect(players.map((p) => p.hasAnswered)).toEqual([true, false]);
    expect(JSON.stringify(players)).not.toContain('optionIndex');
  });

  it('closes the question when time runs out, after a short grace period', () => {
    const { room } = makeRoom();
    join(room, 'A');
    room.start();
    vi.advanceTimersByTime(10_000);
    expect(room.currentPhase).toBe('question'); // still in the grace period
    vi.advanceTimersByTime(ANSWER_GRACE_MS);
    expect(room.currentPhase).toBe('reveal');
  });

  it("doesn't wait for teams whose phones have disconnected", () => {
    const { room } = makeRoom();
    const here = join(room, 'Here', 's1');
    const gone = join(room, 'Gone', 's2');
    room.start();
    room.submitAnswer(here, 0, 1);
    expect(room.currentPhase).toBe('question');
    room.detachSocket(gone, 's2');
    expect(room.currentPhase).toBe('reveal');
  });
});

describe('moving through the quiz', () => {
  it('goes question → reveal → leaderboard → next question → … → finished', () => {
    const { room } = makeRoom();
    const a = join(room, 'A');
    room.start();

    room.submitAnswer(a, 0, 1);
    expect(room.currentPhase).toBe('reveal');
    room.next();
    expect(room.currentPhase).toBe('leaderboard');
    expect(room.toPublicState().reveal).not.toBeNull(); // keeps the points for "+1000" badges
    room.next();
    expect(room.toPublicState().question?.index).toBe(1);

    room.next(); // the host closes question 2 early
    expect(room.currentPhase).toBe('reveal');
    room.next();
    room.next();
    expect(room.currentPhase).toBe('finished');
    expect(room.next().ok).toBe(false);
  });

  it('adds up scores across questions', () => {
    const { room } = makeRoom();
    const a = join(room, 'A');
    room.start();
    room.submitAnswer(a, 0, 1); // +1000
    room.next();
    room.next();
    room.submitAnswer(a, 1, 0); // +1000
    expect(room.toPublicState().players[0]?.score).toBe(2000);
  });

  it('remembers what a team answered, for a phone that reconnects mid-question', () => {
    const { room } = makeRoom();
    const a = join(room, 'A');
    join(room, 'B');
    room.start();
    expect(room.currentAnswerFor(a)).toBeNull();
    room.submitAnswer(a, 0, 3);
    expect(room.currentAnswerFor(a)).toBe(3);
  });
});
