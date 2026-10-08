# Live Suspects

A murder-mystery party game. Claude writes a new case every game and plays every suspect. Players share a room, take turns interrogating the suspects with a shared question budget, and vote on the killer.

## Requirements

- Node.js 22+ and pnpm
- An Anthropic API key (or use the fake mode below)

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

## Develop

```bash
pnpm test        # all unit and integration tests (no API calls)
pnpm typecheck
pnpm gen:case -- --lang ru --suspects 4   # generate one real case and print it (costs API credits)
```

## Layout

- `packages/shared` — zod schemas and types shared by client and server
- `apps/server` — Fastify + Socket.IO server; `engine/` is the pure game logic, `llm/` is everything Claude-related, `rooms/` ties them together
- `apps/client` — React + Vite UI

Design spec: `docs/superpowers/specs/2026-10-08-detective-game-design.md`
