# Live Suspects

A murder-mystery party game. Claude writes a new case every game and plays every suspect. Players share a room, take turns interrogating the suspects with a shared question budget, and vote on the killer.

## Requirements

- Node.js 22+ and pnpm
- An API key for Claude or Groq (Groq has a free plan), or use the fake mode below

## Setup

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # then put your key in ANTHROPIC_API_KEY
```

## Run

```bash
pnpm dev
```

Open http://localhost:5173. To play with friends on your network, share the invite link from the lobby.

To try the game without API calls, set `LLM_MODE=fake` in `apps/server/.env`.

To use Groq instead of Claude, get a key at https://console.groq.com/keys and set in `apps/server/.env`:

```
LLM_PROVIDER=groq
GROQ_API_KEY=your-key
```

Groq's free plan has daily usage limits.

## Develop

```bash
pnpm test        # all unit and integration tests (no API calls)
pnpm typecheck
pnpm gen:case -- --lang ru --suspects 4   # generate one real case and print it (costs API credits)
```

## Layout

- `packages/shared` — zod schemas and types shared by client and server
- `apps/server` — Fastify + Socket.IO server; `engine/` is the pure game logic, `llm/` holds the AI providers (`claude/`, `groq/`) behind shared interfaces, `rooms/` ties them together
- `apps/client` — React + Vite UI

Design spec: `docs/superpowers/specs/2026-10-08-detective-game-design.md`

## Deploy

The game server keeps rooms in memory and holds WebSocket connections, so it cannot run on Vercel's serverless functions. Deploy the client to Vercel and the server to Render (or any host that runs a long-lived Node process).

1. **Server (Render):** New → Blueprint, pick this repo (it reads `render.yaml`). Set `GROQ_API_KEY` (or switch `LLM_PROVIDER` to `claude` and set `ANTHROPIC_API_KEY`). Leave `CLIENT_ORIGIN` empty for now.
2. **Client (Vercel):** import the repo with the root directory unchanged (`vercel.json` handles the build). Add the environment variable `VITE_SERVER_URL` = your Render URL, then deploy.
3. Back in Render, set `CLIENT_ORIGIN` to your Vercel URL (comma-separated for several) and redeploy.

Render's free plan sleeps after inactivity and drops all rooms on restart.
