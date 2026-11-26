import type { Quiz } from '@pub-quiz/shared';
import { Room } from './Room';
import { generateRoomCode } from './roomCode';

/**
 * Keeps track of every live room, in memory.
 *
 * Memory is fast and simple, but it has two limits we'll fix in later milestones:
 *  - restarting the server ends every game in progress
 *  - only one copy of the server can run, because rooms aren't shared (Redis fixes this)
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly onRoomChange: (room: Room) => void,
    private readonly makeCode: () => string = generateRoomCode,
  ) {}

  get size(): number {
    return this.rooms.size;
  }

  create(quiz: Quiz): Room {
    let code: string;
    let attempts = 0;
    do {
      if (++attempts > 1000) throw new Error('Could not find a free room code');
      code = this.makeCode();
    } while (this.rooms.has(code));

    const room = new Room(code, quiz, this.onRoomChange);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /** Close rooms nobody has touched for a while, so abandoned games don't fill up memory. */
  sweep(maxIdleMs: number, now = Date.now()): string[] {
    const closed: string[] = [];
    for (const [code, room] of this.rooms) {
      if (now - room.lastActivityAt > maxIdleMs) {
        room.dispose();
        this.rooms.delete(code);
        closed.push(code);
      }
    }
    return closed;
  }

  disposeAll(): void {
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }
}
