import { describe, expect, it, vi } from 'vitest';
import { ROOM_CODE_ALPHABET, joinPayloadSchema, roomCodeSchema, sampleQuiz } from '@pub-quiz/shared';
import { RoomManager } from '../src/game/RoomManager';
import { generateRoomCode } from '../src/game/roomCode';
import { scoreAnswer } from '../src/game/scoring';

describe('scoreAnswer', () => {
  it('gives 1000 for an instant right answer and 500 on the buzzer', () => {
    expect(scoreAnswer(true, 0, 20_000)).toBe(1000);
    expect(scoreAnswer(true, 10_000, 20_000)).toBe(750);
    expect(scoreAnswer(true, 20_000, 20_000)).toBe(500);
  });

  it('gives nothing for a wrong answer, however fast', () => {
    expect(scoreAnswer(false, 0, 20_000)).toBe(0);
  });

  it('never goes outside 500–1000 (e.g. answers in the grace period)', () => {
    expect(scoreAnswer(true, 25_000, 20_000)).toBe(500);
    expect(scoreAnswer(true, -50, 20_000)).toBe(1000);
  });
});

describe('room codes', () => {
  it('are four letters with no vowels', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-Z]{4}$/);
      expect(code).not.toMatch(/[AEIOUY]/);
    }
  });

  it('are never handed out twice at the same time', () => {
    const codes = ['BBBB', 'BBBB', 'CCCC'];
    const manager = new RoomManager(() => {}, () => codes.shift()!);
    expect(manager.create(sampleQuiz).code).toBe('BBBB');
    expect(manager.create(sampleQuiz).code).toBe('CCCC'); // skipped the duplicate
  });

  it('are validated and tidied up when typed in', () => {
    expect(roomCodeSchema.parse(' kdbx ')).toBe('KDBX');
    expect(roomCodeSchema.safeParse('KDB').success).toBe(false);
    expect(roomCodeSchema.safeParse('KAEX').success).toBe(false); // vowels can't appear
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[AEIOU]/);
  });
});

describe('RoomManager.sweep', () => {
  it('closes rooms that have been idle too long', () => {
    vi.useFakeTimers();
    const manager = new RoomManager(() => {});
    const old = manager.create(sampleQuiz);
    vi.advanceTimersByTime(60_000);
    const fresh = manager.create(sampleQuiz);
    expect(manager.sweep(30_000)).toEqual([old.code]);
    expect(manager.get(old.code)).toBeUndefined();
    expect(manager.get(fresh.code)).toBe(fresh);
    vi.useRealTimers();
  });
});

describe('join validation', () => {
  it('trims team names and rejects empty or very long ones', () => {
    expect(joinPayloadSchema.parse({ code: 'BCDF', name: '  Bears  ' }).name).toBe('Bears');
    expect(joinPayloadSchema.safeParse({ code: 'BCDF', name: '   ' }).success).toBe(false);
    expect(joinPayloadSchema.safeParse({ code: 'BCDF', name: 'x'.repeat(50) }).success).toBe(false);
  });

  it('rejects payloads of the wrong shape entirely', () => {
    expect(joinPayloadSchema.safeParse('hello').success).toBe(false);
    expect(joinPayloadSchema.safeParse({ code: 1234, name: {} }).success).toBe(false);
  });
});
