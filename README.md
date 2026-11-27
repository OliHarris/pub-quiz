# 🍺 Pub Quiz

A live pub quiz. The questions go up on the TV, and teams answer on their phones
by scanning a QR code. There's no app to download and no paper.

- **Real-time:** answers, countdowns and scores update instantly on every screen over WebSockets
- **Quiz builder:** write your own quizzes, or pull questions from a built-in question bank
- **Quick quizzes:** pick some categories and a difficulty, and get a ready-made quiz in one click
- **Saved results:** every finished game's scores are kept on your dashboard
- **Fair:** the server times every answer, so faster right answers score more, and nobody can cheat by faking their clock
- **Robust:** phones that lock or refresh rejoin as the same team, even mid-question
- **Tested:** unit, database, API, WebSocket and end-to-end browser tests

How it's built, and why: **[ARCHITECTURE.md](ARCHITECTURE.md)**

## Run it

You need Node.js 24 (this repo has an `.nvmrc`, so with nvm installed, run `nvm use`).

```bash
nvm use
npm install
npm run dev
```

This starts both servers:

| | URL | What |
|---|---|---|
| Web app | http://localhost:3000 | The pages |
| Back-end | http://localhost:4000 | REST API, live games over WebSockets, and the database |

Open **http://localhost:3000/host** on the laptop connected to the TV to get to
the host dashboard. To play on real phones, connect them to the same Wi-Fi and
scan the QR code. The host screen points the QR code at your computer's network
address automatically. If macOS asks whether to allow incoming connections for
`node`, click **Allow**.

There's nothing to install for the database: it's PostgreSQL running inside the
server ([PGlite](https://pglite.dev)), with its data saved in `apps/server/.data/`.
Delete that folder to start from scratch.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the back-end and web app together |
| `npm test` | Back-end tests: game rules, database, REST API, WebSockets (Vitest) |
| `npm run test:e2e` | End-to-end tests in real browsers (Playwright; run `npx playwright install chromium` once first) |
| `npm run typecheck` | TypeScript checks across every package |
| `npm run lint` | ESLint |
| `npm run db:generate -w @pub-quiz/server` | Create a migration after changing `apps/server/src/db/schema.ts` |
| `npm run db:studio -w @pub-quiz/server` | Browse the database in your browser (stop the server first) |
| `npm run db:seed -w @pub-quiz/server` | Load the question bank files into the database (the server also does this on start-up) |
| `npm run bank:generate -w @pub-quiz/server` | Show the plan and cost for generating the big AI question bank. Add `-- --yes` to run it (needs `ANTHROPIC_API_KEY`) |

## Project layout

```
apps/
  web/          Next.js 16 app: host dashboard, quiz builder, TV screen, phone screens
  server/       Node back-end
    src/api/            REST API (Express)
    src/db/             database schema, connection, seeding (Drizzle + PostgreSQL)
    src/repositories/   the only code that talks to the database
    src/game/           game rules (no networking, no database)
    drizzle/            generated SQL migrations
    data/               question bank seed files
    scripts/            one-off tools: AI question bank generator, seeding
packages/
  shared/       Types, validation rules, ranking and the sample quiz, used by both apps
```

## Configuration

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `PORT` | server | `4000` | Port the back-end listens on |
| `DATA_DIR` | server | `./.data/pglite` | Where the database stores its files |
| `CORS_ORIGIN` | server | any (dev only) | Comma-separated websites allowed to connect. Set this in production. |
| `ANTHROPIC_API_KEY` | server scripts | none | Only for `bank:generate` |
| `NEXT_PUBLIC_GAME_SERVER_URL` | web | same host, port 4000 | Where the screens find the back-end |
