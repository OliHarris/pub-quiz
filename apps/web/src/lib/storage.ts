/**
 * Small wrappers around localStorage. It can throw (private browsing, storage
 * disabled), and the game must still work without it. You'd just lose the
 * ability to rejoin after a refresh.
 */

export function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not fatal: see above.
  }
}

export function removeItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Not fatal.
  }
}

export const HOST_SESSION_KEY = "pubquiz:host";
export const playerSessionKey = (code: string) => `pubquiz:player:${code}`;

export interface HostSession {
  code: string;
  hostToken: string;
  /** Which quiz this room is playing, so opening a different quiz starts a new room. */
  quizId: string;
}

export interface PlayerSession {
  playerToken: string;
}
