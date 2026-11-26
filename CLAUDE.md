# Pub Quiz: notes for Claude

A real-time pub quiz (TV host screen + phone players). npm workspaces monorepo:
`apps/web` (Next.js 16, React 19, Tailwind 4), `apps/server` (Node + Socket.IO),
`packages/shared` (types, zod schemas, sample quiz). Architecture and decisions:
@ARCHITECTURE.md

## Who this is for

The owner is an experienced front-end developer learning back-end and system
architecture through this project, and uses it as a portfolio piece for job
hunting. Claude writes most of the code. So:
- Explain *why* in code comments, in plain English, for someone new to back-end.
- When the architecture changes or a notable decision is made, update ARCHITECTURE.md
  (the decisions log, roadmap and interview Q&A) in the same change.
- Prefer well-known, industry-standard tools that look good on a CV.

## Commands

The machine's default Node is 20, which is too old. Use Node 24 (`nvm use`, or prefix
`PATH="$HOME/.nvm/versions/node/v24.22.3/bin:$PATH"` in non-interactive shells).

- `npm run dev`: both servers (web :3000, game server :4000)
- `npm test`: server unit + integration tests (Vitest)
- `npm run test:e2e`: Playwright, reuses running dev servers
- `npm run typecheck` and `npm run lint`

## Rules of the codebase

- The server is authoritative. Game rules live in `apps/server/src/game/Room.ts`, which
  must stay free of networking code; `createGameServer.ts` is the thin socket layer.
- Every socket message is defined in `packages/shared/src/events.ts` and validated with a
  zod schema from `packages/shared/src/validation.ts` before use.
- Never put secrets (player/host tokens) or the correct answer (before reveal) in `RoomState`.
- New game rules get Vitest tests; new user flows get a Playwright test.
- Next.js 16 has APIs newer than Claude's training data. Read
  `node_modules/next/dist/docs/` before using unfamiliar Next.js features (see apps/web/AGENTS.md).
