/**
 * Where the back-end lives: the game server, which also serves the REST API.
 * In development it's the same machine on port 4000, whichever address this
 * page was opened on (localhost on the laptop, 192.168.x.x on a phone).
 */
export function gameServerUrl(): string {
  if (process.env.NEXT_PUBLIC_GAME_SERVER_URL) return process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  return `${window.location.protocol}//${window.location.hostname}:4000`;
}
