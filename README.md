# 🍺 Pub Quiz

A live pub quiz. The questions go up on the TV, and teams answer on their phones
by scanning a QR code. There's no app to download and no paper.

- **Real-time:** answers, countdowns and scores update instantly on every screen over WebSockets
- **Fair:** the server times every answer, so faster right answers score more, and nobody can cheat by faking their clock
- **Robust:** phones that lock or refresh rejoin as the same team, even mid-question
- **Tested:** unit, integration and end-to-end tests, including a full game with three phones

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
| Game server | http://localhost:4000 | Live games over WebSockets |

Open **http://localhost:3000/host** on the laptop connected to the TV. To play
on real phones, connect them to the same Wi-Fi and scan the QR code. The host
screen points the QR code at your computer's network address automatically. If
macOS asks whether to allow incoming connections for `node`, click **Allow**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the game server and web app together |
| `npm test` | Game-server unit and integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests in real browsers (Playwright; run `npx playwright install chromium` once first) |
| `npm run typecheck` | TypeScript checks across every package |
| `npm run lint` | ESLint |

## Project layout

```
apps/
  web/        Next.js 16 app: the host's TV screen and the players' phone screens
  server/     Node + Socket.IO game server: rooms, the game loop, scoring
packages/
  shared/     Types, validation rules and the sample quiz, used by both apps
```

## Configuration

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `PORT` | server | `4000` | Port the game server listens on |
| `CORS_ORIGIN` | server | any (dev only) | Comma-separated websites allowed to connect. Set this in production. |
| `NEXT_PUBLIC_GAME_SERVER_URL` | web | same host, port 4000 | Where the screens find the game server |
