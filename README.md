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
