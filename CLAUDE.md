# Pub Quiz: notes for Claude

A real-time pub quiz (TV host screen + phone players), with a quiz builder,
question bank and saved results. npm workspaces monorepo:
- `apps/web`: Next.js 16, React 19, Tailwind 4, TanStack Query
- `apps/server`: Node; Express 5 REST API + Socket.IO games on one port; Drizzle ORM over PostgreSQL (PGlite)
- `packages/shared`: types, zod schemas, ranking, sample quiz

Architecture and decisions: @ARCHITECTURE.md

## Who this is for

The owner is an experienced front-end developer learning back-end and system
architecture through this project, and uses it as a portfolio piece for job
hunting. Claude writes most of the code. So:
- Explain *why* in code comments, in plain English, for someone new to back-end.
- When the architecture changes or a notable decision is made, update ARCHITECTURE.md
  (the decisions log, roadmap and interview Q&A) in the same change.
- Prefer well-known, industry-standard tools that look good on a CV.
- Anything that spends money (e.g. `bank:generate --yes`) needs the owner's go-ahead first.

## Commands

The machine's default Node is 20, which is too old. Use Node 24 (`nvm use`, or prefix
`PATH="$HOME/.nvm/versions/node/v24.22.3/bin:$PATH"` in non-interactive shells).

- `npm run dev`: both servers (web :3000, back-end :4000)
- `npm test`: server unit, database, API and WebSocket tests (Vitest, in-memory Postgres)
- `npm run test:e2e`: Playwright, reuses running dev servers
- `npm run typecheck` and `npm run lint`
- `npm run db:generate -w @pub-quiz/server`: after editing `src/db/schema.ts`. Never hand-edit generated migrations.

## Rules of the codebase

- The server is authoritative. Game rules live in `apps/server/src/game/Room.ts`, which
  must stay free of networking and database code; `createGameServer.ts` is the thin socket layer.
- Only `apps/server/src/repositories/` talks to the database. Every query on host-owned data
  is scoped by `host_id` from the authenticated key, never from the request body.
- Every socket message is defined in `packages/shared/src/events.ts`, and every API body or query
  in `packages/shared/src/quiz.ts`. Both are validated with zod before use.
- API errors go through `apps/server/src/api/errors.ts` (shape: `{ error, issues? }`). Someone
  else's resource is a 404, not a 403.
- Never put secrets (player/host tokens, host keys) or the correct answer (before reveal) in `RoomState`.
- New game rules get Vitest tests; new endpoints get supertest tests; new user flows get a Playwright test.
- Next.js 16 has APIs newer than Claude's training data. Read
  `node_modules/next/dist/docs/` before using unfamiliar Next.js features (see apps/web/AGENTS.md).
