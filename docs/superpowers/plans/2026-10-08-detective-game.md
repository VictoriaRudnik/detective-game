# Live Suspects (Detective Game) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser murder-mystery game where one or more players share a room, interrogate Claude-played suspects in turns with a shared question budget, and vote on the killer of an LLM-generated case.

**Architecture:** pnpm monorepo with three packages. `packages/shared` holds zod schemas and types used by both sides. `apps/server` (Node, Fastify, Socket.IO) contains a pure game engine (`reduce(state, action, ctx)`), an LLM layer behind `CaseGenerator`/`SuspectResponder` interfaces (Claude implementations + fakes), a `RoomManager` that applies actions and runs LLM side effects, and a thin Socket.IO transport. `apps/client` (React + Vite) renders a `PublicRoomView` pushed by the server and sends actions.

**Tech Stack:** TypeScript, pnpm workspaces, zod 4, `@anthropic-ai/sdk`, Fastify 5, Socket.IO 4, React 19, Vite, react-i18next, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-08-detective-game-design.md`

## Global Constraints

- Languages: exactly `en` and `ru`; the room language is chosen at creation and the case + answers are in that language.
- Suspect count: 3–5. Moves: `3 × suspectCount + 3`. Question/chat text: 1–500 characters after trimming. Player name: 1–24 characters after trimming. Room code: 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
- Default model for both roles: `claude-opus-5-5`, overridable with `CASE_MODEL` / `SUSPECT_MODEL`. Both Claude calls send `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`.
- Case generation: `client.beta.messages.parse`, `max_tokens: 32000`, `thinking: {type: "adaptive"}`, `output_config: {effort: "high", format: betaZodOutputFormat(GeneratedCaseSchema)}`, up to 3 attempts.
- Suspect answers: `client.beta.messages.stream`, `max_tokens: 4000`, `output_config: {effort: "low"}`, system prompt as one text block with `cache_control: {type: "ephemeral"}`.
- `@anthropic-ai/sdk` is imported only under `apps/server/src/llm/` and `apps/server/src/scripts/`.
- Hidden case data (persona, alibi, secret, knows, isKiller, solution, suspect histories, pending question) never reaches a client before phase `revealed`.
- `ANTHROPIC_API_KEY` lives only in `apps/server/.env` (gitignored). `LLM_MODE=fake` runs the game without API calls.
- Empty rooms are deleted 30 minutes after the last player disconnects. Rooms are in memory only.
- Every commit message ends with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Page reload race** — a player's new socket joins before the old socket's `disconnect` arrives; the player must stay connected. Pinned in Task 10 (`stale socket disconnect` test).
2. **Tie with no questions left** — a regular vote that ties while `movesLeft === 0` must resolve (random among leaders), never return to an investigation where nobody can ask. Pinned in Task 5.
3. **Active player goes offline mid-answer** — when the answer finishes or fails, the turn must move to a connected player instead of staying with the offline one. Pinned in Task 4.
4. **Secret leakage** — the serialized public view during investigating/voting must not contain any suspect's secret, true alibi, motive or the pending question text. Pinned in Task 6.
5. **Messy room codes** — `" k7qf2x "` typed or pasted in lowercase with spaces must join room `K7QF2X`. Pinned in Task 10.

---

## File Structure

```
.gitignore
package.json                      root scripts (dev, test, typecheck, gen:case)
pnpm-workspace.yaml
tsconfig.base.json
README.md
packages/shared/
  package.json  tsconfig.json
  src/index.ts                    re-exports
  src/case.ts                     Case/Suspect schemas, PublicCase, toPublicCase
  src/room.ts                     RoomState, PublicRoomView, LogEntry, constants
  src/errors.ts                   GameErrorCode
  src/events.ts                   socket payload schemas + event maps
  src/testing/sampleCase.ts       deterministic valid case for tests and fakes
  src/*.test.ts
apps/server/
  package.json  tsconfig.json  .env.example
  src/index.ts                    process entry
  src/env.ts                      .env loading
  src/app.ts                      startServer(): Fastify + Socket.IO + RoomManager
  src/engine/types.ts             EngineCtx, ReducerResult
  src/engine/actions.ts           Action union
  src/engine/state.ts             createRoom + small state helpers
  src/engine/lobby.ts             join/disconnect/start/caseReady/caseFailed/restart
  src/engine/interrogation.ts     ask/answerDone/answerFailed/chat
  src/engine/voting.ts            proposeVote/castVote/resolution
  src/engine/reducer.ts           reduce(): clone + dispatch to handlers
  src/engine/publicView.ts        toPublicView()
  src/engine/testUtils.ts         test helpers
  src/llm/types.ts                CaseRequest, CaseGenerator, SuspectResponder, LlmError
  src/llm/caseValidator.ts        validateCase()
  src/llm/generateValidCase.ts    retry loop
  src/llm/prompts/casePrompt.ts
  src/llm/prompts/suspectPrompt.ts
  src/llm/prompts/language.ts
  src/llm/fakes.ts                FakeCaseGenerator, FakeSuspectResponder
  src/llm/claude/ClaudeCaseGenerator.ts
  src/llm/claude/ClaudeSuspectResponder.ts
  src/llm/claude/constants.ts
  src/llm/createLlm.ts            env → implementations
  src/rooms/roomId.ts
  src/rooms/RoomManager.ts
  src/transport/socket.ts         event handlers + RoomEvents adapter
  src/transport/socket.test.ts    end-to-end over real sockets
  src/scripts/genCase.ts
apps/client/
  package.json  tsconfig.json  vite.config.ts  index.html
  src/main.tsx  src/App.tsx  src/styles.css
  src/i18n/index.ts  src/i18n/en.json  src/i18n/ru.json
  src/net/socket.ts  src/net/session.ts  src/net/roomPath.ts  src/net/useRoom.ts
  src/components/TextForm.tsx  ErrorToast.tsx  LanguageSwitch.tsx  SuspectList.tsx (also used by Vote)
  src/screens/types.ts  Home.tsx  Lobby.tsx  Generating.tsx  Vote.tsx  Reveal.tsx
  src/screens/investigation/Investigation.tsx  Briefing.tsx  CaseLog.tsx
  src/test/setup.ts  src/test/fixtures.ts
```

---

### Task 1: Monorepo scaffold and shared schemas

**Files:**
- Create: `.gitignore`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/case.ts`, `room.ts`, `errors.ts`, `events.ts`, `index.ts`, `testing/sampleCase.ts`
- Test: `packages/shared/src/case.test.ts`, `packages/shared/src/events.test.ts`

**Interfaces:**
- Produces (import from `@game/shared`): `LanguageSchema`, `Language`, `LANGUAGES`, `MIN_SUSPECTS`, `MAX_SUSPECTS`, `SuspectSchema`, `GeneratedCaseSchema`, `CaseSchema`, types `Briefing`, `Suspect`, `Solution`, `GeneratedCase`, `Case`, `PublicSuspect`, `PublicCase`, `toPublicCase(c: Case): PublicCase`; `MAX_TEXT_LENGTH`, `movesForSuspectCount(n)`, types `Phase`, `SystemCode`, `Player`, `LogEntry`, `ConversationTurn`, `Vote`, `GameResult`, `PendingAnswer`, `RoomState`, `PublicRoomView`; `GAME_ERROR_CODES`, `GameErrorCode`; `CreateRoomPayloadSchema`, `JoinRoomPayloadSchema`, `AskPayloadSchema`, `ChatPayloadSchema`, `CastVotePayloadSchema`, payload types, `AckResult`, `ClientToServerEvents`, `ServerToClientEvents`.
- Produces (import from `@game/shared/testing`): `sampleCase(suspectCount = 4, language: Language = "en"): GeneratedCase` — killer is `s1` ("Margaret Hale"), suspects `s1…sN`.

- [ ] **Step 1: Create the workspace files**

`.gitignore`:
```gitignore
node_modules/
dist/
.env
*.log
.DS_Store
coverage/
```

`package.json`:
```json
{
  "name": "live-suspects",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "pnpm --parallel --filter @game/server --filter @game/client dev",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "gen:case": "pnpm --filter @game/server gen:case"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  }
}
```

`packages/shared/package.json`:
```json
{
  "name": "@game/shared",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing/sampleCase.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Run:
```bash
pnpm add zod --filter @game/shared
pnpm add -D typescript vitest --filter @game/shared
```
Expected: `zod` (4.x) in dependencies, `typescript` and `vitest` in devDependencies of `packages/shared/package.json`, a root `pnpm-lock.yaml`.

- [ ] **Step 2: Write the failing tests**

`packages/shared/src/case.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CaseSchema, GeneratedCaseSchema, toPublicCase } from "./case";
import { sampleCase } from "./testing/sampleCase";

describe("case schemas", () => {
  it.each([3, 4, 5])("sampleCase(%i) is a valid generated case", (count) => {
    const c = sampleCase(count);
    expect(GeneratedCaseSchema.parse(c)).toEqual(c);
    expect(c.suspects).toHaveLength(count);
    expect(c.suspects.filter((s) => s.isKiller).map((s) => s.id)).toEqual(["s1"]);
  });

  it("sampleCase uses the requested language", () => {
    expect(sampleCase(3, "ru").language).toBe("ru");
  });

  it("rejects a case with a missing field", () => {
    const { briefing: _omit, ...broken } = sampleCase(3);
    expect(GeneratedCaseSchema.safeParse(broken).success).toBe(false);
  });

  it("CaseSchema requires an id", () => {
    expect(CaseSchema.safeParse(sampleCase(3)).success).toBe(false);
    expect(CaseSchema.safeParse({ ...sampleCase(3), id: "c1" }).success).toBe(true);
  });

  it("lists solution before suspects so the model writes the truth first", () => {
    const keys = Object.keys(GeneratedCaseSchema.shape);
    expect(keys.indexOf("solution")).toBeLessThan(keys.indexOf("suspects"));
  });
});

describe("toPublicCase", () => {
  it("keeps only public suspect fields and drops the solution", () => {
    const pub = toPublicCase({ ...sampleCase(3), id: "c1" });
    expect(Object.keys(pub).sort()).toEqual(["briefing", "language", "suspects", "title"]);
    expect(Object.keys(pub.suspects[0]!).sort()).toEqual(["id", "name", "publicDescription", "role"]);
  });
});
```

`packages/shared/src/events.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CreateRoomPayloadSchema, JoinRoomPayloadSchema } from "./events";
import { movesForSuspectCount } from "./room";

describe("socket payload schemas", () => {
  it("trims the player name and accepts 3–5 suspects", () => {
    const parsed = CreateRoomPayloadSchema.parse({ name: "  Anna ", language: "en", suspectCount: 5 });
    expect(parsed.name).toBe("Anna");
  });

  it.each([2, 6, 3.5])("rejects suspectCount %s", (suspectCount) => {
    expect(CreateRoomPayloadSchema.safeParse({ name: "Anna", language: "en", suspectCount }).success).toBe(false);
  });

  it("rejects blank and too long names", () => {
    expect(CreateRoomPayloadSchema.safeParse({ name: "   ", language: "en", suspectCount: 3 }).success).toBe(false);
    expect(CreateRoomPayloadSchema.safeParse({ name: "x".repeat(25), language: "en", suspectCount: 3 }).success).toBe(false);
  });

  it("rejects unknown languages", () => {
    expect(CreateRoomPayloadSchema.safeParse({ name: "Anna", language: "de", suspectCount: 3 }).success).toBe(false);
  });

  it("normalizes room codes to trimmed upper case", () => {
    expect(JoinRoomPayloadSchema.parse({ roomId: " k7qf2x ", name: "Boris" }).roomId).toBe("K7QF2X");
    expect(JoinRoomPayloadSchema.safeParse({ roomId: "K7QF", name: "Boris" }).success).toBe(false);
  });
});

describe("movesForSuspectCount", () => {
  it("is 3 per suspect plus 3", () => {
    expect([3, 4, 5].map(movesForSuspectCount)).toEqual([12, 15, 18]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @game/shared test`
Expected: FAIL — cannot resolve `./case`, `./events`, `./room`.

- [ ] **Step 4: Implement the shared modules**

`packages/shared/src/case.ts`:
```ts
import { z } from "zod";

export const LANGUAGES = ["en", "ru"] as const;
export const LanguageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof LanguageSchema>;

export const MIN_SUSPECTS = 3;
export const MAX_SUSPECTS = 5;

export const BriefingSchema = z.object({
  victim: z.string(),
  location: z.string(),
  timeOfDeath: z.string(),
  causeOfDeath: z.string(),
  setting: z.string(),
});

export const SuspectSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  publicDescription: z.string(),
  persona: z.object({ personality: z.string(), speechStyle: z.string() }),
  alibi: z.object({ claimed: z.string(), truth: z.string() }),
  secret: z.string(),
  knows: z.array(z.string()),
  isKiller: z.boolean(),
});

export const SolutionSchema = z.object({
  killerId: z.string(),
  method: z.string(),
  motive: z.string(),
  keyEvidence: z.array(z.string()),
});

/**
 * The shape Claude generates. Deliberately free of min/max constraints: the
 * game rules live in the server's case validator, which can explain failures.
 * `solution` comes before `suspects` so the model decides the truth first.
 */
export const GeneratedCaseSchema = z.object({
  title: z.string(),
  language: LanguageSchema,
  briefing: BriefingSchema,
  solution: SolutionSchema,
  suspects: z.array(SuspectSchema),
});

export const CaseSchema = GeneratedCaseSchema.extend({ id: z.string() });

export type Briefing = z.infer<typeof BriefingSchema>;
export type Suspect = z.infer<typeof SuspectSchema>;
export type Solution = z.infer<typeof SolutionSchema>;
export type GeneratedCase = z.infer<typeof GeneratedCaseSchema>;
export type Case = z.infer<typeof CaseSchema>;

export type PublicSuspect = Pick<Suspect, "id" | "name" | "role" | "publicDescription">;

export interface PublicCase {
  title: string;
  language: Language;
  briefing: Briefing;
  suspects: PublicSuspect[];
}

export function toPublicCase(c: Case): PublicCase {
  return {
    title: c.title,
    language: c.language,
    briefing: c.briefing,
    suspects: c.suspects.map(({ id, name, role, publicDescription }) => ({ id, name, role, publicDescription })),
  };
}
```

`packages/shared/src/errors.ts`:
```ts
export const GAME_ERROR_CODES = [
  "ROOM_NOT_FOUND",
  "NOT_IN_ROOM",
  "UNKNOWN_PLAYER",
  "NOT_HOST",
  "WRONG_PHASE",
  "NOT_YOUR_TURN",
  "NO_MOVES_LEFT",
  "ANSWER_IN_PROGRESS",
  "UNKNOWN_SUSPECT",
  "INVALID_TEXT",
  "INVALID_PAYLOAD",
  "CASE_GENERATION_FAILED",
] as const;

export type GameErrorCode = (typeof GAME_ERROR_CODES)[number];
```

`packages/shared/src/room.ts`:
```ts
import type { Case, Language, PublicCase } from "./case";

export const MAX_TEXT_LENGTH = 500;

export function movesForSuspectCount(suspectCount: number): number {
  return 3 * suspectCount + 3;
}

export type Phase = "lobby" | "generating" | "investigating" | "voting" | "revealed";

export type SystemCode = "SUSPECT_SILENT" | "VOTE_STARTED" | "VOTE_TIED" | "FORCED_VOTE";

export interface Player {
  id: string;
  name: string;
  connected: boolean;
}

interface EntryBase {
  id: string;
  ts: number;
}

export type LogEntry =
  | (EntryBase & { kind: "question"; playerId: string; suspectId: string; text: string })
  | (EntryBase & { kind: "answer"; suspectId: string; text: string })
  | (EntryBase & { kind: "chat"; playerId: string; text: string })
  | (EntryBase & { kind: "system"; code: SystemCode });

/** One turn of a suspect's private conversation, as sent to the LLM. */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface Vote {
  initiatorId?: string;
  ballots: Record<string, string>;
  forced: boolean;
}

export interface GameResult {
  accusedId: string;
  correct: boolean;
}

export interface PendingAnswer {
  suspectId: string;
  entryId: string;
  question: string;
}

/** Full server-side room state. Never sent to clients as-is. */
export interface RoomState {
  id: string;
  hostId: string;
  language: Language;
  suspectCount: number;
  players: Player[];
  phase: Phase;
  case?: Case;
  movesLeft: number;
  turnPlayerId?: string;
  log: LogEntry[];
  suspectHistories: Record<string, ConversationTurn[]>;
  vote?: Vote;
  pendingAnswer?: PendingAnswer;
  result?: GameResult;
}

/** What every client in the room receives. */
export interface PublicRoomView {
  id: string;
  hostId: string;
  language: Language;
  suspectCount: number;
  players: Player[];
  phase: Phase;
  movesLeft: number;
  turnPlayerId?: string;
  log: LogEntry[];
  vote?: Vote;
  pendingAnswer?: Omit<PendingAnswer, "question">;
  result?: GameResult;
  case?: PublicCase;
  /** The full case, present only in phase "revealed". */
  reveal?: Case;
}
```

`packages/shared/src/events.ts`:
```ts
import { z } from "zod";
import { LanguageSchema, MAX_SUSPECTS, MIN_SUSPECTS } from "./case";
import type { GameErrorCode } from "./errors";
import type { PublicRoomView } from "./room";

const NameSchema = z.string().trim().min(1).max(24);
const PlayerIdSchema = z.string().min(1).max(64);
const RoomCodeSchema = z.string().trim().toUpperCase().length(6);

export const CreateRoomPayloadSchema = z.object({
  name: NameSchema,
  language: LanguageSchema,
  suspectCount: z.number().int().min(MIN_SUSPECTS).max(MAX_SUSPECTS),
  playerId: PlayerIdSchema.optional(),
});

export const JoinRoomPayloadSchema = z.object({
  roomId: RoomCodeSchema,
  name: NameSchema,
  playerId: PlayerIdSchema.optional(),
});

export const AskPayloadSchema = z.object({ suspectId: z.string(), text: z.string() });
export const ChatPayloadSchema = z.object({ text: z.string() });
export const CastVotePayloadSchema = z.object({ suspectId: z.string() });

export type CreateRoomPayload = z.input<typeof CreateRoomPayloadSchema>;
export type JoinRoomPayload = z.input<typeof JoinRoomPayloadSchema>;
export type AskPayload = z.input<typeof AskPayloadSchema>;
export type ChatPayload = z.input<typeof ChatPayloadSchema>;
export type CastVotePayload = z.input<typeof CastVotePayloadSchema>;

export type AckResult = { ok: true; roomId: string; playerId: string } | { ok: false; error: GameErrorCode };

export interface ClientToServerEvents {
  "room:create": (payload: CreateRoomPayload, ack: (result: AckResult) => void) => void;
  "room:join": (payload: JoinRoomPayload, ack: (result: AckResult) => void) => void;
  "game:start": () => void;
  ask: (payload: AskPayload) => void;
  chat: (payload: ChatPayload) => void;
  "vote:propose": () => void;
  "vote:cast": (payload: CastVotePayload) => void;
  "game:restart": () => void;
}

export interface ServerToClientEvents {
  "room:state": (view: PublicRoomView) => void;
  "answer:delta": (delta: { entryId: string; text: string }) => void;
  "game:error": (error: { code: GameErrorCode }) => void;
}
```

`packages/shared/src/index.ts`:
```ts
export * from "./case";
export * from "./errors";
export * from "./events";
export * from "./room";
```

`packages/shared/src/testing/sampleCase.ts`:
```ts
import type { GeneratedCase, Language, Suspect } from "../case";

const SUSPECTS: Suspect[] = [
  {
    id: "s1",
    name: "Margaret Hale",
    role: "the victim's wife",
    publicDescription: "Elegant and composed, married to Edmund for twenty years.",
    persona: { personality: "Cold, controlled, quietly calculating.", speechStyle: "Formal, clipped sentences; never raises her voice." },
    alibi: { claimed: "I was reading in the library all evening.", truth: "At 21:40 she slipped into the study and poured poison into Edmund's brandy." },
    secret: "She is drowning in gambling debts that Edmund refused to pay.",
    knows: ["Edmund drank his brandy alone in the study every night at ten."],
    isKiller: true,
  },
  {
    id: "s2",
    name: "Dr. Arthur Finch",
    role: "the family doctor",
    publicDescription: "A nervous physician who has treated the Hales for years.",
    persona: { personality: "Anxious, eager to please, easily flustered.", speechStyle: "Rambling, full of medical jargon and apologies." },
    alibi: { claimed: "I was playing cards in the drawing room.", truth: "He was playing cards in the drawing room with Thomas Reed." },
    secret: "He prescribed Edmund morphine without keeping any records.",
    knows: ["Margaret asked me last week which poisons cannot be tasted in brandy."],
    isKiller: false,
  },
  {
    id: "s3",
    name: "Lucy Grey",
    role: "the maid",
    publicDescription: "A young maid who sees everything and says little.",
    persona: { personality: "Observant, timid, loyal to the household.", speechStyle: "Short, polite answers; calls everyone sir or madam." },
    alibi: { claimed: "I was polishing silver in the kitchen.", truth: "She left the kitchen to meet Henry Cole by the back door." },
    secret: "She is secretly engaged to the gardener against the house rules.",
    knows: ["I saw Margaret leave the library at 21:40 and walk towards the study."],
    isKiller: false,
  },
  {
    id: "s4",
    name: "Thomas Reed",
    role: "the victim's business partner",
    publicDescription: "A loud, confident man who co-owns the Hale shipping company.",
    persona: { personality: "Boastful, impatient, defensive when cornered.", speechStyle: "Loud, uses business slang, interrupts." },
    alibi: { claimed: "I was playing cards with the doctor.", truth: "He was playing cards with the doctor in the drawing room." },
    secret: "He has been embezzling money from the company.",
    knows: ["Edmund told me he was changing his will to leave Margaret nothing."],
    isKiller: false,
  },
  {
    id: "s5",
    name: "Henry Cole",
    role: "the gardener",
    publicDescription: "A quiet gardener who was not supposed to be in the house that night.",
    persona: { personality: "Gruff, honest, uncomfortable indoors.", speechStyle: "Few words, rural expressions." },
    alibi: { claimed: "I was in my cottage all night.", truth: "He came to the back door to meet Lucy." },
    secret: "He entered the manor without permission to see Lucy.",
    knows: ["The library lamp went dark at 21:35 and was lit again at 22:00."],
    isKiller: false,
  },
];

/** A small, valid case for tests and the fake LLM. The killer is always "s1". */
export function sampleCase(suspectCount = 4, language: Language = "en"): GeneratedCase {
  if (suspectCount < 1 || suspectCount > SUSPECTS.length) {
    throw new RangeError(`sampleCase supports 1–${SUSPECTS.length} suspects, got ${suspectCount}`);
  }
  const suspects = structuredClone(SUSPECTS.slice(0, suspectCount));
  return {
    title: "Death at Blackmoor Manor",
    language,
    briefing: {
      victim: "Lord Edmund Hale, 58, shipping magnate",
      location: "The study of Blackmoor Manor",
      timeOfDeath: "Around 22:15",
      causeOfDeath: "Poisoning",
      setting: "A stormy autumn night; the roads were flooded and nobody could leave the manor.",
    },
    solution: {
      killerId: "s1",
      method: "Poison poured into his evening brandy",
      motive: "Edmund refused to pay her gambling debts and was about to cut her out of his will.",
      keyEvidence: suspects.filter((s) => !s.isKiller).map((s) => s.knows[0]!),
    },
    suspects,
  };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @game/shared test && pnpm --filter @game/shared typecheck`
Expected: all tests PASS, typecheck prints no errors.

- [ ] **Step 6: Commit**

```bash
git add .gitignore package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json packages/shared
git commit -m "feat(shared): add workspace and shared case/room/event schemas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Server package and case validator

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`
- Create: `apps/server/src/llm/types.ts`, `apps/server/src/llm/caseValidator.ts`
- Test: `apps/server/src/llm/caseValidator.test.ts`

**Interfaces:**
- Consumes: `GeneratedCase`, `Language`, `sampleCase` from Task 1.
- Produces: `CaseRequest { language: Language; suspectCount: number }`, `CaseGenerator { generate(req: CaseRequest, feedback?: string[]): Promise<GeneratedCase> }`, `AnswerRequest { case: Case; suspect: Suspect; history: ConversationTurn[]; question: string }`, `SuspectResponder { answer(req: AnswerRequest, onDelta: (text: string) => void): Promise<string> }`, `class LlmError extends Error`, `validateCase(c: GeneratedCase, req: CaseRequest): string[]` (empty array = valid).

- [ ] **Step 1: Create the server package**

`apps/server/package.json`:
```json
{
  "name": "@game/server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "gen:case": "tsx src/scripts/genCase.ts"
  }
}
```

`apps/server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src"]
}
```

Run:
```bash
pnpm add @game/shared@workspace:* @anthropic-ai/sdk zod fastify socket.io --filter @game/server
pnpm add -D typescript vitest tsx @types/node socket.io-client --filter @game/server
```
Expected: dependencies added to `apps/server/package.json`.

- [ ] **Step 2: Write the LLM interfaces**

`apps/server/src/llm/types.ts`:
```ts
import type { Case, ConversationTurn, GeneratedCase, Language, Suspect } from "@game/shared";

export interface CaseRequest {
  language: Language;
  suspectCount: number;
}

export interface CaseGenerator {
  /** Generates one candidate case. `feedback` lists problems with the previous attempt. Throws on failure. */
  generate(req: CaseRequest, feedback?: string[]): Promise<GeneratedCase>;
}

export interface AnswerRequest {
  case: Case;
  suspect: Suspect;
  /** Earlier questions to this suspect and their answers, oldest first. */
  history: ConversationTurn[];
  question: string;
}

export interface SuspectResponder {
  /** Streams the in-character answer through `onDelta` and resolves with the full text. Throws on failure. */
  answer(req: AnswerRequest, onDelta: (text: string) => void): Promise<string>;
}

export class LlmError extends Error {
  override name = "LlmError";
}
```

- [ ] **Step 3: Write the failing validator tests**

`apps/server/src/llm/caseValidator.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { sampleCase } from "@game/shared/testing";
import { validateCase } from "./caseValidator";

const req = { language: "en" as const, suspectCount: 4 };

describe("validateCase", () => {
  it.each([3, 4, 5])("accepts the sample case with %i suspects", (suspectCount) => {
    expect(validateCase(sampleCase(suspectCount), { language: "en", suspectCount })).toEqual([]);
  });

  it("rejects the wrong language", () => {
    expect(validateCase(sampleCase(4, "ru"), req)).toEqual([expect.stringContaining("language")]);
  });

  it("rejects the wrong number of suspects", () => {
    expect(validateCase(sampleCase(3), req)).toEqual([expect.stringContaining("expected 4 suspects")]);
  });

  it("rejects duplicate suspect ids", () => {
    const c = sampleCase(4);
    c.suspects[1]!.id = "s3";
    expect(validateCase(c, req)).toContainEqual(expect.stringContaining("unique"));
  });

  it("rejects zero or two killers", () => {
    const none = sampleCase(4);
    none.suspects[0]!.isKiller = false;
    expect(validateCase(none, req)).toContainEqual(expect.stringContaining("exactly one suspect"));

    const two = sampleCase(4);
    two.suspects[1]!.isKiller = true;
    expect(validateCase(two, req)).toContainEqual(expect.stringContaining("exactly one suspect"));
  });

  it("rejects a solution pointing at an innocent suspect", () => {
    const c = sampleCase(4);
    c.solution.killerId = "s2";
    expect(validateCase(c, req)).toContainEqual(expect.stringContaining("solution.killerId"));
  });

  it("rejects a killer whose claimed alibi equals the truth", () => {
    const c = sampleCase(4);
    c.suspects[0]!.alibi.truth = `  ${c.suspects[0]!.alibi.claimed.toUpperCase()} `;
    expect(validateCase(c, req)).toContainEqual(expect.stringContaining("alibi"));
  });

  it("rejects empty key evidence", () => {
    const c = sampleCase(4);
    c.solution.keyEvidence = [];
    expect(validateCase(c, req)).toContainEqual(expect.stringContaining("keyEvidence must not be empty"));
  });

  it("rejects key evidence that only the killer knows", () => {
    const c = sampleCase(4);
    c.solution.keyEvidence.push(c.suspects[0]!.knows[0]!);
    expect(validateCase(c, req)).toContainEqual(expect.stringContaining("innocent suspect"));
  });

  it("matches key evidence case-insensitively after trimming", () => {
    const c = sampleCase(4);
    c.solution.keyEvidence = c.solution.keyEvidence.map((e) => ` ${e.toUpperCase()} `);
    expect(validateCase(c, req)).toEqual([]);
  });

  it("rejects blank text fields and names their path", () => {
    const c = sampleCase(4);
    c.suspects[2]!.secret = "   ";
    expect(validateCase(c, req)).toEqual(["case.suspects[2].secret must not be empty"]);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm --filter @game/server exec vitest run src/llm/caseValidator.test.ts`
Expected: FAIL — cannot resolve `./caseValidator`.

- [ ] **Step 5: Implement the validator**

`apps/server/src/llm/caseValidator.ts`:
```ts
import type { GeneratedCase } from "@game/shared";
import type { CaseRequest } from "./types";

const normalize = (text: string) => text.trim().toLowerCase();

/** Checks the game rules a generated case must satisfy. Returns human-readable problems; empty means valid. */
export function validateCase(c: GeneratedCase, req: CaseRequest): string[] {
  const errors: string[] = [];

  if (c.language !== req.language) {
    errors.push(`language must be "${req.language}", got "${c.language}"`);
  }
  if (c.suspects.length !== req.suspectCount) {
    errors.push(`expected ${req.suspectCount} suspects, got ${c.suspects.length}`);
  }

  const ids = c.suspects.map((s) => s.id);
  if (new Set(ids).size !== ids.length) {
    errors.push("suspect ids must be unique");
  }

  const killers = c.suspects.filter((s) => s.isKiller);
  if (killers.length !== 1) {
    errors.push(`exactly one suspect must have isKiller=true, got ${killers.length}`);
  }
  const killer = killers.length === 1 ? killers[0] : undefined;
  if (killer && killer.id !== c.solution.killerId) {
    errors.push(`solution.killerId "${c.solution.killerId}" does not match the killer "${killer.id}"`);
  }
  if (killer && normalize(killer.alibi.claimed) === normalize(killer.alibi.truth)) {
    errors.push("the killer's claimed alibi must differ from the truth");
  }

  if (c.solution.keyEvidence.length === 0) {
    errors.push("solution.keyEvidence must not be empty");
  }
  const innocentFacts = new Set(c.suspects.filter((s) => !s.isKiller).flatMap((s) => s.knows.map(normalize)));
  for (const evidence of c.solution.keyEvidence) {
    if (!innocentFacts.has(normalize(evidence))) {
      errors.push(`key evidence "${evidence}" must appear verbatim in the knows list of at least one innocent suspect`);
    }
  }

  for (const path of blankTextPaths(c, "case")) {
    errors.push(`${path} must not be empty`);
  }
  return errors;
}

function blankTextPaths(value: unknown, path: string): string[] {
  if (typeof value === "string") return value.trim() === "" ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((item, i) => blankTextPaths(item, `${path}[${i}]`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => blankTextPaths(item, `${path}.${key}`));
  }
  return [];
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @game/server exec vitest run src/llm/caseValidator.test.ts && pnpm --filter @game/server typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/server pnpm-lock.yaml
git commit -m "feat(server): add LLM interfaces and generated case validator" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Engine core — room lifecycle

**Files:**
- Create: `apps/server/src/engine/types.ts`, `actions.ts`, `state.ts`, `lobby.ts`, `reducer.ts`, `testUtils.ts`
- Test: `apps/server/src/engine/lobby.test.ts`

**Interfaces:**
- Consumes: `RoomState`, `Case`, `GameErrorCode`, `movesForSuspectCount`, `MAX_TEXT_LENGTH`, `SystemCode` (Task 1); `sampleCase`.
- Produces:
  - `EngineCtx { now(): number; newId(): string; random(): number }`
  - `ReducerResult = { ok: true; state: RoomState } | { ok: false; error: GameErrorCode }`
  - `Action` union (this task: `join`, `disconnect`, `start`, `caseReady`, `caseFailed`, `restart`; Tasks 4–5 extend it)
  - `reduce(state: RoomState, action: Action, ctx: EngineCtx): ReducerResult` — never mutates `state`
  - `createRoom(p: NewRoomParams): RoomState`, `findPlayer`, `isConnected`, `nextConnectedPlayerId(s, afterId)`, `appendSystem(s, code, ctx)`, `normalizeText(text): string | undefined`, `resetToLobby(s)`
  - test helpers: `testCtx`, `apply(state, ...actions)`, `errorOf(state, action, ctx?)`, `lobby(playerIds?)`, `investigating(playerIds?, suspectCount?)`

Handlers receive a cloned draft, mutate it, and return a `GameErrorCode` to reject the action (the reducer then discards the draft).

- [ ] **Step 1: Write the engine types, actions, state helpers and test utils**

`apps/server/src/engine/types.ts`:
```ts
import type { GameErrorCode, RoomState } from "@game/shared";

/** Everything non-deterministic the engine needs, injected so the engine stays pure. */
export interface EngineCtx {
  now(): number;
  newId(): string;
  /** Returns a number in [0, 1). */
  random(): number;
}

export type ReducerResult = { ok: true; state: RoomState } | { ok: false; error: GameErrorCode };
```

`apps/server/src/engine/actions.ts`:
```ts
import type { Case } from "@game/shared";

export type Action =
  | { type: "join"; playerId: string; name: string }
  | { type: "disconnect"; playerId: string }
  | { type: "start"; playerId: string }
  | { type: "caseReady"; case: Case }
  | { type: "caseFailed" }
  | { type: "restart"; playerId: string };

export type ActionOf<T extends Action["type"]> = Extract<Action, { type: T }>;
```

`apps/server/src/engine/state.ts`:
```ts
import { MAX_TEXT_LENGTH, type Language, type Player, type RoomState, type SystemCode } from "@game/shared";
import type { EngineCtx } from "./types";

export interface NewRoomParams {
  roomId: string;
  hostId: string;
  hostName: string;
  language: Language;
  suspectCount: number;
}

export function createRoom(p: NewRoomParams): RoomState {
  return {
    id: p.roomId,
    hostId: p.hostId,
    language: p.language,
    suspectCount: p.suspectCount,
    players: [{ id: p.hostId, name: p.hostName, connected: true }],
    phase: "lobby",
    movesLeft: 0,
    log: [],
    suspectHistories: {},
  };
}

export function findPlayer(s: RoomState, playerId: string): Player | undefined {
  return s.players.find((p) => p.id === playerId);
}

export function isConnected(s: RoomState, playerId: string | undefined): boolean {
  return playerId !== undefined && findPlayer(s, playerId)?.connected === true;
}

/** The next connected player after `afterId` in join order, wrapping around (may return `afterId` itself). */
export function nextConnectedPlayerId(s: RoomState, afterId: string | undefined): string | undefined {
  const count = s.players.length;
  const start = afterId === undefined ? -1 : s.players.findIndex((p) => p.id === afterId);
  for (let step = 1; step <= count; step++) {
    const candidate = s.players[(start + step) % count]!;
    if (candidate.connected) return candidate.id;
  }
  return undefined;
}

export function appendSystem(s: RoomState, code: SystemCode, ctx: EngineCtx): void {
  s.log.push({ kind: "system", id: ctx.newId(), ts: ctx.now(), code });
}

/** Trims player text; returns undefined when it is empty or too long. */
export function normalizeText(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_TEXT_LENGTH ? trimmed : undefined;
}

export function resetToLobby(s: RoomState): void {
  s.phase = "lobby";
  s.case = undefined;
  s.movesLeft = 0;
  s.turnPlayerId = undefined;
  s.log = [];
  s.suspectHistories = {};
  s.vote = undefined;
  s.pendingAnswer = undefined;
  s.result = undefined;
}
```

`apps/server/src/engine/testUtils.ts`:
```ts
import type { GameErrorCode, RoomState } from "@game/shared";
import { sampleCase } from "@game/shared/testing";
import type { Action } from "./actions";
import { reduce } from "./reducer";
import { createRoom } from "./state";
import type { EngineCtx } from "./types";

let idCounter = 0;

export const testCtx: EngineCtx = {
  now: () => 1_000,
  newId: () => `id${++idCounter}`,
  random: () => 0,
};

/** Applies actions in order and throws if any is rejected. */
export function apply(state: RoomState, ...actions: Action[]): RoomState {
  return actions.reduce((current, action) => {
    const result = reduce(current, action, testCtx);
    if (!result.ok) throw new Error(`${action.type} rejected: ${result.error}`);
    return result.state;
  }, state);
}

export function errorOf(state: RoomState, action: Action, ctx: EngineCtx = testCtx): GameErrorCode | undefined {
  const result = reduce(state, action, ctx);
  return result.ok ? undefined : result.error;
}

/** A lobby whose host is the first id; the others have joined. */
export function lobby(playerIds: string[] = ["p1", "p2"], suspectCount = 3): RoomState {
  const [hostId, ...guests] = playerIds;
  const room = createRoom({ roomId: "ROOM01", hostId: hostId!, hostName: hostId!.toUpperCase(), language: "en", suspectCount });
  return apply(room, ...guests.map((id): Action => ({ type: "join", playerId: id, name: id.toUpperCase() })));
}

/** A room in "investigating" with the sample case (killer "s1"); the first player has the turn. */
export function investigating(playerIds: string[] = ["p1", "p2"], suspectCount = 3): RoomState {
  return apply(
    lobby(playerIds, suspectCount),
    { type: "start", playerId: playerIds[0]! },
    { type: "caseReady", case: { ...sampleCase(suspectCount), id: "case1" } },
  );
}
```

- [ ] **Step 2: Write the failing lobby tests**

`apps/server/src/engine/lobby.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { sampleCase } from "@game/shared/testing";
import { reduce } from "./reducer";
import { createRoom } from "./state";
import { apply, errorOf, investigating, lobby, testCtx } from "./testUtils";

describe("createRoom", () => {
  it("creates a lobby with the connected host", () => {
    const room = createRoom({ roomId: "ABC234", hostId: "p1", hostName: "Anna", language: "ru", suspectCount: 4 });
    expect(room).toMatchObject({
      id: "ABC234",
      hostId: "p1",
      language: "ru",
      suspectCount: 4,
      phase: "lobby",
      players: [{ id: "p1", name: "Anna", connected: true }],
    });
  });
});

describe("join", () => {
  it("adds a new player", () => {
    expect(lobby(["p1", "p2"]).players.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("reconnects a known player without duplicating them", () => {
    const s = apply(lobby(), { type: "disconnect", playerId: "p2" }, { type: "join", playerId: "p2", name: "Boris" });
    expect(s.players).toEqual([
      { id: "p1", name: "P1", connected: true },
      { id: "p2", name: "Boris", connected: true },
    ]);
  });

  it("makes the joiner host when the host is offline", () => {
    const s = apply(lobby(["p1"]), { type: "disconnect", playerId: "p1" }, { type: "join", playerId: "p9", name: "Late" });
    expect(s.hostId).toBe("p9");
  });

  it("gives the turn to a joiner when nobody holds it during the investigation", () => {
    const s = apply(
      investigating(["p1"]),
      { type: "disconnect", playerId: "p1" },
      { type: "join", playerId: "p2", name: "Boris" },
    );
    expect(s.turnPlayerId).toBe("p2");
  });
});

describe("disconnect", () => {
  it("marks the player offline and moves the host role to the next connected player", () => {
    const s = apply(lobby(["p1", "p2", "p3"]), { type: "disconnect", playerId: "p1" });
    expect(s.players[0]!.connected).toBe(false);
    expect(s.hostId).toBe("p2");
  });

  it("keeps the host when nobody else is connected", () => {
    const s = apply(lobby(["p1"]), { type: "disconnect", playerId: "p1" });
    expect(s.hostId).toBe("p1");
  });

  it("rejects unknown players", () => {
    expect(errorOf(lobby(), { type: "disconnect", playerId: "nobody" })).toBe("UNKNOWN_PLAYER");
  });
});

describe("start", () => {
  it("lets only the host start, and only from the lobby", () => {
    expect(errorOf(lobby(), { type: "start", playerId: "p2" })).toBe("NOT_HOST");
    const generating = apply(lobby(), { type: "start", playerId: "p1" });
    expect(generating.phase).toBe("generating");
    expect(errorOf(generating, { type: "start", playerId: "p1" })).toBe("WRONG_PHASE");
  });
});

describe("caseReady / caseFailed", () => {
  it("starts the investigation with the move budget and the first connected player's turn", () => {
    const s = investigating(["p1", "p2"], 3);
    expect(s.phase).toBe("investigating");
    expect(s.case?.id).toBe("case1");
    expect(s.movesLeft).toBe(12);
    expect(s.turnPlayerId).toBe("p1");
    expect(s.suspectHistories).toEqual({ s1: [], s2: [], s3: [] });
  });

  it("rejects a case outside the generating phase", () => {
    expect(errorOf(lobby(), { type: "caseReady", case: { ...sampleCase(3), id: "c" } })).toBe("WRONG_PHASE");
  });

  it("returns to the lobby when generation fails", () => {
    const s = apply(lobby(), { type: "start", playerId: "p1" }, { type: "caseFailed" });
    expect(s.phase).toBe("lobby");
  });
});

describe("restart", () => {
  it("resets a revealed game to the lobby, host only", () => {
    const revealed = { ...investigating(), phase: "revealed" as const };
    expect(errorOf(revealed, { type: "restart", playerId: "p2" })).toBe("NOT_HOST");
    const s = apply(revealed, { type: "restart", playerId: "p1" });
    expect(s).toMatchObject({ phase: "lobby", movesLeft: 0, log: [], suspectHistories: {} });
    expect(s.case).toBeUndefined();
    expect(s.players).toHaveLength(2);
  });

  it("is only allowed after the reveal", () => {
    expect(errorOf(investigating(), { type: "restart", playerId: "p1" })).toBe("WRONG_PHASE");
  });
});

describe("reduce", () => {
  it("never mutates the input state", () => {
    const before = lobby();
    const snapshot = structuredClone(before);
    reduce(before, { type: "join", playerId: "p3", name: "C" }, testCtx);
    reduce(before, { type: "start", playerId: "p2" }, testCtx);
    expect(before).toEqual(snapshot);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @game/server exec vitest run src/engine/lobby.test.ts`
Expected: FAIL — cannot resolve `./reducer`.

- [ ] **Step 4: Implement the lobby handlers and reducer**

`apps/server/src/engine/lobby.ts`:
```ts
import { movesForSuspectCount, type GameErrorCode, type RoomState } from "@game/shared";
import type { ActionOf } from "./actions";
import { findPlayer, isConnected, nextConnectedPlayerId, resetToLobby } from "./state";

type Result = GameErrorCode | undefined;

export function join(s: RoomState, a: ActionOf<"join">): Result {
  const existing = findPlayer(s, a.playerId);
  if (existing) {
    existing.connected = true;
    existing.name = a.name;
  } else {
    s.players.push({ id: a.playerId, name: a.name, connected: true });
  }
  if (!isConnected(s, s.hostId)) s.hostId = a.playerId;
  if (s.phase === "investigating" && !isConnected(s, s.turnPlayerId)) s.turnPlayerId = a.playerId;
  return undefined;
}

export function disconnect(s: RoomState, a: ActionOf<"disconnect">): Result {
  const player = findPlayer(s, a.playerId);
  if (!player) return "UNKNOWN_PLAYER";
  player.connected = false;
  if (s.hostId === player.id) {
    const next = nextConnectedPlayerId(s, player.id);
    if (next) s.hostId = next;
  }
  return undefined;
}

export function start(s: RoomState, a: ActionOf<"start">): Result {
  if (a.playerId !== s.hostId) return "NOT_HOST";
  if (s.phase !== "lobby") return "WRONG_PHASE";
  resetToLobby(s);
  s.phase = "generating";
  return undefined;
}

export function caseReady(s: RoomState, a: ActionOf<"caseReady">): Result {
  if (s.phase !== "generating") return "WRONG_PHASE";
  s.case = a.case;
  s.phase = "investigating";
  s.movesLeft = movesForSuspectCount(a.case.suspects.length);
  s.suspectHistories = Object.fromEntries(a.case.suspects.map((suspect) => [suspect.id, []]));
  s.turnPlayerId = nextConnectedPlayerId(s, undefined);
  return undefined;
}

export function caseFailed(s: RoomState): Result {
  if (s.phase !== "generating") return "WRONG_PHASE";
  s.phase = "lobby";
  return undefined;
}

export function restart(s: RoomState, a: ActionOf<"restart">): Result {
  if (a.playerId !== s.hostId) return "NOT_HOST";
  if (s.phase !== "revealed") return "WRONG_PHASE";
  resetToLobby(s);
  return undefined;
}
```

`apps/server/src/engine/reducer.ts`:
```ts
import type { GameErrorCode, RoomState } from "@game/shared";
import type { Action } from "./actions";
import { caseFailed, caseReady, disconnect, join, restart, start } from "./lobby";
import type { EngineCtx, ReducerResult } from "./types";

/** Applies one action to a copy of the state. The input state is never modified. */
export function reduce(state: RoomState, action: Action, ctx: EngineCtx): ReducerResult {
  const draft = structuredClone(state);
  const error = dispatch(draft, action, ctx);
  return error ? { ok: false, error } : { ok: true, state: draft };
}

function dispatch(s: RoomState, action: Action, _ctx: EngineCtx): GameErrorCode | undefined {
  switch (action.type) {
    case "join":
      return join(s, action);
    case "disconnect":
      return disconnect(s, action);
    case "start":
      return start(s, action);
    case "caseReady":
      return caseReady(s, action);
    case "caseFailed":
      return caseFailed(s);
    case "restart":
      return restart(s, action);
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @game/server exec vitest run src/engine && pnpm --filter @game/server typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/engine
git commit -m "feat(engine): add pure room lifecycle reducer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Engine — questions, answers, turns and chat

**Files:**
- Create: `apps/server/src/engine/interrogation.ts`
- Modify: `apps/server/src/engine/actions.ts`, `apps/server/src/engine/reducer.ts`, `apps/server/src/engine/lobby.ts` (`disconnect`)
- Test: `apps/server/src/engine/interrogation.test.ts`

**Interfaces:**
- Consumes: Task 3 helpers.
- Produces: actions `{ type: "ask"; playerId; suspectId; text }`, `{ type: "answerDone"; text }`, `{ type: "answerFailed" }`, `{ type: "chat"; playerId; text }`. After `ask`, `state.pendingAnswer = { suspectId, entryId, question }` where `entryId` is the empty answer entry's id; `RoomManager` (Task 9) reads it.

- [ ] **Step 1: Write the failing tests**

`apps/server/src/engine/interrogation.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { RoomState } from "@game/shared";
import { apply, errorOf, investigating, lobby } from "./testUtils";

const ask = (playerId: string, text = "Where were you at ten?", suspectId = "s2") =>
  ({ type: "ask", playerId, suspectId, text }) as const;
const done = (text = "In the drawing room.") => ({ type: "answerDone", text }) as const;

describe("ask", () => {
  it("logs the question and an empty answer, spends a move and waits for the answer", () => {
    const s = apply(investigating(), ask("p1", "  Where were you?  "));
    const [question, answer] = s.log;
    expect(question).toMatchObject({ kind: "question", playerId: "p1", suspectId: "s2", text: "Where were you?" });
    expect(answer).toMatchObject({ kind: "answer", suspectId: "s2", text: "" });
    expect(s.movesLeft).toBe(11);
    expect(s.pendingAnswer).toEqual({ suspectId: "s2", entryId: answer!.id, question: "Where were you?" });
  });

  it.each<[string, string, (s: RoomState) => RoomState, ReturnType<typeof ask>]>([
    ["WRONG_PHASE", "outside the investigation", () => lobby(), ask("p1")],
    ["NOT_YOUR_TURN", "by a player whose turn it is not", (s) => s, ask("p2")],
    ["ANSWER_IN_PROGRESS", "while a suspect is answering", (s) => apply(s, ask("p1")), ask("p1")],
    ["NO_MOVES_LEFT", "without moves left", (s) => ({ ...s, movesLeft: 0 }), ask("p1")],
    ["UNKNOWN_SUSPECT", "to an unknown suspect", (s) => s, ask("p1", "Hi", "s9")],
    ["INVALID_TEXT", "with blank text", (s) => s, ask("p1", "   ")],
    ["INVALID_TEXT", "with text over 500 characters", (s) => s, ask("p1", "x".repeat(501))],
  ])("rejects with %s when asked %s", (code, _description, prepare, action) => {
    expect(errorOf(prepare(investigating()), action)).toBe(code);
  });
});

describe("answerDone", () => {
  it("fills the answer, records the suspect's history and passes the turn", () => {
    const s = apply(investigating(), ask("p1", "Where?"), done("Nowhere."));
    expect(s.log[1]).toMatchObject({ kind: "answer", text: "Nowhere." });
    expect(s.suspectHistories.s2).toEqual([
      { role: "user", content: "Where?" },
      { role: "assistant", content: "Nowhere." },
    ]);
    expect(s.pendingAnswer).toBeUndefined();
    expect(s.turnPlayerId).toBe("p2");
  });

  it("wraps the turn around to the first player", () => {
    const s = apply(investigating(), ask("p1"), done(), ask("p2"), done());
    expect(s.turnPlayerId).toBe("p1");
  });

  it("skips disconnected players", () => {
    const s = apply(investigating(["p1", "p2", "p3"]), { type: "disconnect", playerId: "p2" }, ask("p1"), done());
    expect(s.turnPlayerId).toBe("p3");
  });

  it("moves the turn on when the asker went offline mid-answer", () => {
    const s = apply(investigating(), ask("p1"), { type: "disconnect", playerId: "p1" }, done());
    expect(s.turnPlayerId).toBe("p2");
  });

  it("is rejected when no answer is pending", () => {
    expect(errorOf(investigating(), done())).toBe("WRONG_PHASE");
  });
});

describe("answerFailed", () => {
  it("removes the empty answer, refunds the move and keeps the turn", () => {
    const s = apply(investigating(), ask("p1"), { type: "answerFailed" });
    expect(s.log.map((e) => e.kind)).toEqual(["question", "system"]);
    expect(s.log[1]).toMatchObject({ kind: "system", code: "SUSPECT_SILENT" });
    expect(s.movesLeft).toBe(12);
    expect(s.pendingAnswer).toBeUndefined();
    expect(s.turnPlayerId).toBe("p1");
    expect(s.suspectHistories.s2).toEqual([]);
  });

  it("passes the turn when the asker is offline", () => {
    const s = apply(investigating(), ask("p1"), { type: "disconnect", playerId: "p1" }, { type: "answerFailed" });
    expect(s.turnPlayerId).toBe("p2");
  });
});

describe("turns and disconnects", () => {
  it("passes an idle turn when the active player disconnects", () => {
    expect(apply(investigating(), { type: "disconnect", playerId: "p1" }).turnPlayerId).toBe("p2");
  });

  it("keeps the turn while that player's question is being answered", () => {
    expect(apply(investigating(), ask("p1"), { type: "disconnect", playerId: "p1" }).turnPlayerId).toBe("p1");
  });

  it("leaves nobody holding the turn when everyone is offline", () => {
    const s = apply(investigating(), { type: "disconnect", playerId: "p1" }, { type: "disconnect", playerId: "p2" });
    expect(s.turnPlayerId).toBeUndefined();
  });
});

describe("chat", () => {
  it("adds a chat entry in any phase without spending moves", () => {
    const s = apply(lobby(), { type: "chat", playerId: "p2", text: " hello " });
    expect(s.log).toEqual([expect.objectContaining({ kind: "chat", playerId: "p2", text: "hello" })]);
  });

  it("rejects blank text and unknown players", () => {
    expect(errorOf(lobby(), { type: "chat", playerId: "p2", text: " " })).toBe("INVALID_TEXT");
    expect(errorOf(lobby(), { type: "chat", playerId: "zz", text: "hi" })).toBe("UNKNOWN_PLAYER");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @game/server exec vitest run src/engine/interrogation.test.ts`
Expected: FAIL — `ask rejected` errors / type errors for unknown action types.

- [ ] **Step 3: Extend the Action union**

Replace `apps/server/src/engine/actions.ts` with:
```ts
import type { Case } from "@game/shared";

export type Action =
  | { type: "join"; playerId: string; name: string }
  | { type: "disconnect"; playerId: string }
  | { type: "start"; playerId: string }
  | { type: "caseReady"; case: Case }
  | { type: "caseFailed" }
  | { type: "restart"; playerId: string }
  | { type: "ask"; playerId: string; suspectId: string; text: string }
  | { type: "answerDone"; text: string }
  | { type: "answerFailed" }
  | { type: "chat"; playerId: string; text: string };

export type ActionOf<T extends Action["type"]> = Extract<Action, { type: T }>;
```

- [ ] **Step 4: Implement the interrogation handlers**

`apps/server/src/engine/interrogation.ts`:
```ts
import type { GameErrorCode, RoomState } from "@game/shared";
import type { ActionOf } from "./actions";
import { appendSystem, findPlayer, isConnected, nextConnectedPlayerId, normalizeText } from "./state";
import type { EngineCtx } from "./types";

type Result = GameErrorCode | undefined;

export function ask(s: RoomState, a: ActionOf<"ask">, ctx: EngineCtx): Result {
  if (s.phase !== "investigating") return "WRONG_PHASE";
  if (s.pendingAnswer) return "ANSWER_IN_PROGRESS";
  if (s.turnPlayerId !== a.playerId) return "NOT_YOUR_TURN";
  if (s.movesLeft <= 0) return "NO_MOVES_LEFT";
  if (!s.case?.suspects.some((suspect) => suspect.id === a.suspectId)) return "UNKNOWN_SUSPECT";
  const text = normalizeText(a.text);
  if (!text) return "INVALID_TEXT";

  const ts = ctx.now();
  const entryId = ctx.newId();
  s.log.push(
    { kind: "question", id: ctx.newId(), ts, playerId: a.playerId, suspectId: a.suspectId, text },
    { kind: "answer", id: entryId, ts, suspectId: a.suspectId, text: "" },
  );
  s.movesLeft -= 1;
  s.pendingAnswer = { suspectId: a.suspectId, entryId, question: text };
  return undefined;
}

export function answerDone(s: RoomState, a: ActionOf<"answerDone">): Result {
  const pending = s.pendingAnswer;
  if (!pending) return "WRONG_PHASE";

  const entry = s.log.find((e) => e.id === pending.entryId);
  if (entry?.kind === "answer") entry.text = a.text;
  (s.suspectHistories[pending.suspectId] ??= []).push(
    { role: "user", content: pending.question },
    { role: "assistant", content: a.text },
  );
  s.pendingAnswer = undefined;
  s.turnPlayerId = nextConnectedPlayerId(s, s.turnPlayerId);
  return undefined;
}

export function answerFailed(s: RoomState, ctx: EngineCtx): Result {
  const pending = s.pendingAnswer;
  if (!pending) return "WRONG_PHASE";

  s.log = s.log.filter((e) => e.id !== pending.entryId);
  s.movesLeft += 1;
  s.pendingAnswer = undefined;
  appendSystem(s, "SUSPECT_SILENT", ctx);
  if (!isConnected(s, s.turnPlayerId)) s.turnPlayerId = nextConnectedPlayerId(s, s.turnPlayerId);
  return undefined;
}

export function chat(s: RoomState, a: ActionOf<"chat">, ctx: EngineCtx): Result {
  if (!findPlayer(s, a.playerId)) return "UNKNOWN_PLAYER";
  const text = normalizeText(a.text);
  if (!text) return "INVALID_TEXT";
  s.log.push({ kind: "chat", id: ctx.newId(), ts: ctx.now(), playerId: a.playerId, text });
  return undefined;
}
```

- [ ] **Step 5: Pass the idle turn on disconnect**

In `apps/server/src/engine/lobby.ts`, replace the `disconnect` function with:
```ts
export function disconnect(s: RoomState, a: ActionOf<"disconnect">): Result {
  const player = findPlayer(s, a.playerId);
  if (!player) return "UNKNOWN_PLAYER";
  player.connected = false;
  if (s.hostId === player.id) {
    const next = nextConnectedPlayerId(s, player.id);
    if (next) s.hostId = next;
  }
  // While their question is being answered the turn stays put; answerDone/answerFailed move it on.
  if (s.phase === "investigating" && s.turnPlayerId === player.id && !s.pendingAnswer) {
    s.turnPlayerId = nextConnectedPlayerId(s, player.id);
  }
  return undefined;
}
```

- [ ] **Step 6: Route the new actions in the reducer**

Replace `apps/server/src/engine/reducer.ts` with:
```ts
import type { GameErrorCode, RoomState } from "@game/shared";
import type { Action } from "./actions";
import { answerDone, answerFailed, ask, chat } from "./interrogation";
import { caseFailed, caseReady, disconnect, join, restart, start } from "./lobby";
import type { EngineCtx, ReducerResult } from "./types";

/** Applies one action to a copy of the state. The input state is never modified. */
export function reduce(state: RoomState, action: Action, ctx: EngineCtx): ReducerResult {
  const draft = structuredClone(state);
  const error = dispatch(draft, action, ctx);
  return error ? { ok: false, error } : { ok: true, state: draft };
}

function dispatch(s: RoomState, action: Action, ctx: EngineCtx): GameErrorCode | undefined {
  switch (action.type) {
    case "join":
      return join(s, action);
    case "disconnect":
      return disconnect(s, action);
    case "start":
      return start(s, action);
    case "caseReady":
      return caseReady(s, action);
    case "caseFailed":
      return caseFailed(s);
    case "restart":
      return restart(s, action);
    case "ask":
      return ask(s, action, ctx);
    case "answerDone":
      return answerDone(s, action);
    case "answerFailed":
      return answerFailed(s, ctx);
    case "chat":
      return chat(s, action, ctx);
  }
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm --filter @game/server exec vitest run src/engine && pnpm --filter @game/server typecheck`
Expected: PASS (lobby + interrogation), no type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/engine
git commit -m "feat(engine): add questions, answers, turn rotation and chat" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Engine — voting, forced vote and reveal

**Files:**
- Create: `apps/server/src/engine/voting.ts`
- Modify: `apps/server/src/engine/actions.ts`, `reducer.ts`, `interrogation.ts` (`answerDone`), `lobby.ts` (`disconnect`)
- Test: `apps/server/src/engine/voting.test.ts`

**Interfaces:**
- Produces: actions `{ type: "proposeVote"; playerId }`, `{ type: "castVote"; playerId; suspectId }`; `startVote(s, initiatorId | undefined, forced, ctx)`; `resolveVoteIfComplete(s, ctx)`. On reveal: `phase = "revealed"`, `result = { accusedId, correct }`.

- [ ] **Step 1: Write the failing tests**

`apps/server/src/engine/voting.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { RoomState } from "@game/shared";
import { reduce } from "./reducer";
import { apply, errorOf, investigating, lobby, testCtx } from "./testUtils";

const propose = (playerId = "p1") => ({ type: "proposeVote", playerId }) as const;
const cast = (playerId: string, suspectId: string) => ({ type: "castVote", playerId, suspectId }) as const;
const voting = (players = ["p1", "p2"]) => apply(investigating(players), propose());

describe("proposeVote", () => {
  it("opens a regular vote", () => {
    const s = voting();
    expect(s.phase).toBe("voting");
    expect(s.vote).toEqual({ initiatorId: "p1", ballots: {}, forced: false });
    expect(s.log.at(-1)).toMatchObject({ kind: "system", code: "VOTE_STARTED" });
  });

  it("is rejected outside the investigation and while a suspect is answering", () => {
    expect(errorOf(lobby(), propose())).toBe("WRONG_PHASE");
    const answering = apply(investigating(), { type: "ask", playerId: "p1", suspectId: "s1", text: "Hi" });
    expect(errorOf(answering, propose("p2"))).toBe("ANSWER_IN_PROGRESS");
  });
});

describe("castVote", () => {
  it("waits until every connected player has voted", () => {
    const s = apply(voting(), cast("p1", "s1"));
    expect(s.phase).toBe("voting");
    expect(s.vote?.ballots).toEqual({ p1: "s1" });
  });

  it("reveals a correct accusation", () => {
    const s = apply(voting(), cast("p1", "s1"), cast("p2", "s1"));
    expect(s.phase).toBe("revealed");
    expect(s.result).toEqual({ accusedId: "s1", correct: true });
  });

  it("reveals a wrong accusation", () => {
    const s = apply(voting(["p1", "p2", "p3"]), cast("p1", "s2"), cast("p2", "s2"), cast("p3", "s1"));
    expect(s.result).toEqual({ accusedId: "s2", correct: false });
  });

  it("lets a player change their ballot before the vote closes", () => {
    const s = apply(voting(), cast("p1", "s2"), cast("p1", "s1"), cast("p2", "s1"));
    expect(s.result?.accusedId).toBe("s1");
  });

  it("returns to the investigation on a regular tie", () => {
    const s = apply(voting(), cast("p1", "s1"), cast("p2", "s2"));
    expect(s.phase).toBe("investigating");
    expect(s.vote).toBeUndefined();
    expect(s.log.at(-1)).toMatchObject({ kind: "system", code: "VOTE_TIED" });
  });

  it("resolves a regular tie randomly when no questions are left", () => {
    const noMoves: RoomState = { ...investigating(), movesLeft: 0 };
    const s = apply(noMoves, propose(), cast("p1", "s1"), cast("p2", "s2"));
    expect(s.phase).toBe("revealed");
    expect(s.result?.accusedId).toBe("s1");
  });

  it("does not wait for disconnected players", () => {
    const s = apply(voting(), cast("p1", "s1"), { type: "disconnect", playerId: "p2" });
    expect(s.phase).toBe("revealed");
  });

  it("rejects unknown suspects, unknown players and votes outside the voting phase", () => {
    expect(errorOf(voting(), cast("p1", "s9"))).toBe("UNKNOWN_SUSPECT");
    expect(errorOf(voting(), cast("zz", "s1"))).toBe("UNKNOWN_PLAYER");
    expect(errorOf(investigating(), cast("p1", "s1"))).toBe("WRONG_PHASE");
  });
});

describe("forced vote", () => {
  const lastQuestion = () =>
    apply(
      { ...investigating(), movesLeft: 1 },
      { type: "ask", playerId: "p1", suspectId: "s2", text: "Last one" },
      { type: "answerDone", text: "Fine." },
    );

  it("starts when the last move is spent", () => {
    const s = lastQuestion();
    expect(s.phase).toBe("voting");
    expect(s.vote).toEqual({ initiatorId: undefined, ballots: {}, forced: true });
    expect(s.log.at(-1)).toMatchObject({ kind: "system", code: "FORCED_VOTE" });
  });

  it("breaks ties randomly among the leaders", () => {
    const tied = apply(lastQuestion(), cast("p1", "s2"));
    const first = apply(tied, cast("p2", "s3"));
    expect(first.result?.accusedId).toBe("s2");

    const result = reduce(tied, cast("p2", "s3"), { ...testCtx, random: () => 0.99 });
    expect(result.ok && result.state.result?.accusedId).toBe("s3");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @game/server exec vitest run src/engine/voting.test.ts`
Expected: FAIL — `proposeVote` / `castVote` are not known actions.

- [ ] **Step 3: Extend the Action union**

Replace `apps/server/src/engine/actions.ts` with:
```ts
import type { Case } from "@game/shared";

export type Action =
  | { type: "join"; playerId: string; name: string }
  | { type: "disconnect"; playerId: string }
  | { type: "start"; playerId: string }
  | { type: "caseReady"; case: Case }
  | { type: "caseFailed" }
  | { type: "restart"; playerId: string }
  | { type: "ask"; playerId: string; suspectId: string; text: string }
  | { type: "answerDone"; text: string }
  | { type: "answerFailed" }
  | { type: "chat"; playerId: string; text: string }
  | { type: "proposeVote"; playerId: string }
  | { type: "castVote"; playerId: string; suspectId: string };

export type ActionOf<T extends Action["type"]> = Extract<Action, { type: T }>;
```

- [ ] **Step 4: Implement voting**

`apps/server/src/engine/voting.ts`:
```ts
import type { GameErrorCode, RoomState } from "@game/shared";
import type { ActionOf } from "./actions";
import { appendSystem, findPlayer } from "./state";
import type { EngineCtx } from "./types";

type Result = GameErrorCode | undefined;

export function proposeVote(s: RoomState, a: ActionOf<"proposeVote">, ctx: EngineCtx): Result {
  if (!findPlayer(s, a.playerId)) return "UNKNOWN_PLAYER";
  if (s.phase !== "investigating") return "WRONG_PHASE";
  if (s.pendingAnswer) return "ANSWER_IN_PROGRESS";
  startVote(s, a.playerId, false, ctx);
  return undefined;
}

export function startVote(s: RoomState, initiatorId: string | undefined, forced: boolean, ctx: EngineCtx): void {
  s.phase = "voting";
  s.vote = { initiatorId, ballots: {}, forced };
  appendSystem(s, forced ? "FORCED_VOTE" : "VOTE_STARTED", ctx);
}

export function castVote(s: RoomState, a: ActionOf<"castVote">, ctx: EngineCtx): Result {
  if (!findPlayer(s, a.playerId)?.connected) return "UNKNOWN_PLAYER";
  if (s.phase !== "voting" || !s.vote) return "WRONG_PHASE";
  if (!s.case?.suspects.some((suspect) => suspect.id === a.suspectId)) return "UNKNOWN_SUSPECT";
  s.vote.ballots[a.playerId] = a.suspectId;
  resolveVoteIfComplete(s, ctx);
  return undefined;
}

/** Closes the vote once every connected player has a ballot. */
export function resolveVoteIfComplete(s: RoomState, ctx: EngineCtx): void {
  const vote = s.vote;
  if (s.phase !== "voting" || !vote || !s.case) return;
  const voters = s.players.filter((p) => p.connected);
  if (voters.length === 0 || voters.some((p) => vote.ballots[p.id] === undefined)) return;

  const tally = new Map<string, number>();
  for (const voter of voters) {
    const suspectId = vote.ballots[voter.id]!;
    tally.set(suspectId, (tally.get(suspectId) ?? 0) + 1);
  }
  const top = Math.max(...tally.values());
  const leaders = [...tally].filter(([, count]) => count === top).map(([suspectId]) => suspectId);

  // With no questions left a tie cannot go back to the investigation, so it is decided by lot.
  if (leaders.length > 1 && !vote.forced && s.movesLeft > 0) {
    s.phase = "investigating";
    s.vote = undefined;
    appendSystem(s, "VOTE_TIED", ctx);
    return;
  }
  const accusedId = leaders[Math.floor(ctx.random() * leaders.length)]!;
  s.phase = "revealed";
  s.result = { accusedId, correct: accusedId === s.case.solution.killerId };
}
```

- [ ] **Step 5: Hook voting into answers, disconnects and the reducer**

In `apps/server/src/engine/interrogation.ts`, add the import and replace `answerDone`:
```ts
import { startVote } from "./voting";
```
```ts
export function answerDone(s: RoomState, a: ActionOf<"answerDone">, ctx: EngineCtx): Result {
  const pending = s.pendingAnswer;
  if (!pending) return "WRONG_PHASE";

  const entry = s.log.find((e) => e.id === pending.entryId);
  if (entry?.kind === "answer") entry.text = a.text;
  (s.suspectHistories[pending.suspectId] ??= []).push(
    { role: "user", content: pending.question },
    { role: "assistant", content: a.text },
  );
  s.pendingAnswer = undefined;
  s.turnPlayerId = nextConnectedPlayerId(s, s.turnPlayerId);
  if (s.movesLeft === 0) startVote(s, undefined, true, ctx);
  return undefined;
}
```

In `apps/server/src/engine/lobby.ts`, add the imports and replace `disconnect`:
```ts
import type { EngineCtx } from "./types";
import { resolveVoteIfComplete } from "./voting";
```
```ts
export function disconnect(s: RoomState, a: ActionOf<"disconnect">, ctx: EngineCtx): Result {
  const player = findPlayer(s, a.playerId);
  if (!player) return "UNKNOWN_PLAYER";
  player.connected = false;
  if (s.hostId === player.id) {
    const next = nextConnectedPlayerId(s, player.id);
    if (next) s.hostId = next;
  }
  // While their question is being answered the turn stays put; answerDone/answerFailed move it on.
  if (s.phase === "investigating" && s.turnPlayerId === player.id && !s.pendingAnswer) {
    s.turnPlayerId = nextConnectedPlayerId(s, player.id);
  }
  resolveVoteIfComplete(s, ctx);
  return undefined;
}
```

Replace `apps/server/src/engine/reducer.ts` with:
```ts
import type { GameErrorCode, RoomState } from "@game/shared";
import type { Action } from "./actions";
import { answerDone, answerFailed, ask, chat } from "./interrogation";
import { caseFailed, caseReady, disconnect, join, restart, start } from "./lobby";
import type { EngineCtx, ReducerResult } from "./types";
import { castVote, proposeVote } from "./voting";

/** Applies one action to a copy of the state. The input state is never modified. */
export function reduce(state: RoomState, action: Action, ctx: EngineCtx): ReducerResult {
  const draft = structuredClone(state);
  const error = dispatch(draft, action, ctx);
  return error ? { ok: false, error } : { ok: true, state: draft };
}

function dispatch(s: RoomState, action: Action, ctx: EngineCtx): GameErrorCode | undefined {
  switch (action.type) {
    case "join":
      return join(s, action);
    case "disconnect":
      return disconnect(s, action, ctx);
    case "start":
      return start(s, action);
    case "caseReady":
      return caseReady(s, action);
    case "caseFailed":
      return caseFailed(s);
    case "restart":
      return restart(s, action);
    case "ask":
      return ask(s, action, ctx);
    case "answerDone":
      return answerDone(s, action, ctx);
    case "answerFailed":
      return answerFailed(s, ctx);
    case "chat":
      return chat(s, action, ctx);
    case "proposeVote":
      return proposeVote(s, action, ctx);
    case "castVote":
      return castVote(s, action, ctx);
  }
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @game/server exec vitest run src/engine && pnpm --filter @game/server typecheck`
Expected: PASS for lobby, interrogation and voting tests; no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/engine
git commit -m "feat(engine): add voting, forced vote and reveal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Public view projection

**Files:**
- Create: `apps/server/src/engine/publicView.ts`
- Test: `apps/server/src/engine/publicView.test.ts`

**Interfaces:**
- Consumes: `RoomState`, `PublicRoomView`, `toPublicCase`.
- Produces: `toPublicView(state: RoomState): PublicRoomView`.

- [ ] **Step 1: Write the failing tests**

`apps/server/src/engine/publicView.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { toPublicView } from "./publicView";
import { apply, investigating, lobby } from "./testUtils";

describe("toPublicView", () => {
  it("has no case in the lobby", () => {
    const view = toPublicView(lobby());
    expect(view.case).toBeUndefined();
    expect(view.reveal).toBeUndefined();
    expect(view.players).toHaveLength(2);
  });

  it("never leaks hidden case data before the reveal", () => {
    const state = apply(
      investigating(),
      { type: "ask", playerId: "p1", suspectId: "s2", text: "Q-SENTINEL" },
      { type: "answerDone", text: "fine" },
      { type: "ask", playerId: "p2", suspectId: "s3", text: "PENDING-SENTINEL" },
    );
    const hidden = [
      ...state.case!.suspects.flatMap((s) => [s.secret, s.alibi.truth, s.persona.personality, ...s.knows]),
      state.case!.solution.motive,
      state.case!.solution.method,
    ];

    for (const s of [state, apply(state, { type: "answerDone", text: "ok" }, { type: "proposeVote", playerId: "p1" })]) {
      const view = toPublicView(s);
      const json = JSON.stringify(view);
      for (const text of hidden) expect(json).not.toContain(text);
      expect(json).not.toContain("isKiller");
      expect(view).not.toHaveProperty("suspectHistories");
      expect(view.reveal).toBeUndefined();
    }
    expect(JSON.stringify(toPublicView(state))).not.toContain("PENDING-SENTINEL");
    expect(toPublicView(state).pendingAnswer).toEqual({ suspectId: "s3", entryId: state.pendingAnswer!.entryId });
  });

  it("exposes public suspect fields and the briefing", () => {
    const view = toPublicView(investigating());
    expect(view.case?.suspects[0]).toEqual({
      id: "s1",
      name: "Margaret Hale",
      role: "the victim's wife",
      publicDescription: "Elegant and composed, married to Edmund for twenty years.",
    });
    expect(view.case?.briefing.causeOfDeath).toBe("Poisoning");
  });

  it("includes the full case after the reveal", () => {
    const revealed = apply(
      investigating(),
      { type: "proposeVote", playerId: "p1" },
      { type: "castVote", playerId: "p1", suspectId: "s1" },
      { type: "castVote", playerId: "p2", suspectId: "s1" },
    );
    const view = toPublicView(revealed);
    expect(view.reveal).toEqual(revealed.case);
    expect(view.result).toEqual({ accusedId: "s1", correct: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @game/server exec vitest run src/engine/publicView.test.ts`
Expected: FAIL — cannot resolve `./publicView`.

- [ ] **Step 3: Implement the projection**

`apps/server/src/engine/publicView.ts`:
```ts
import { toPublicCase, type PublicRoomView, type RoomState } from "@game/shared";

/** The only way room state leaves the server. Strips everything players must not see before the reveal. */
export function toPublicView(s: RoomState): PublicRoomView {
  return {
    id: s.id,
    hostId: s.hostId,
    language: s.language,
    suspectCount: s.suspectCount,
    players: s.players,
    phase: s.phase,
    movesLeft: s.movesLeft,
    turnPlayerId: s.turnPlayerId,
    log: s.log,
    vote: s.vote,
    pendingAnswer: s.pendingAnswer && { suspectId: s.pendingAnswer.suspectId, entryId: s.pendingAnswer.entryId },
    result: s.result,
    case: s.case && toPublicCase(s.case),
    reveal: s.phase === "revealed" ? s.case : undefined,
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @game/server exec vitest run src/engine && pnpm --filter @game/server typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/engine
git commit -m "feat(engine): add public room view that hides case secrets" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Prompts, fakes and the case retry loop

**Files:**
- Create: `apps/server/src/llm/prompts/language.ts`, `casePrompt.ts`, `suspectPrompt.ts`
- Create: `apps/server/src/llm/fakes.ts`, `apps/server/src/llm/generateValidCase.ts`
- Test: `apps/server/src/llm/prompts/casePrompt.test.ts`, `suspectPrompt.test.ts`, `apps/server/src/llm/generateValidCase.test.ts`

**Interfaces:**
- Consumes: `CaseRequest`, `CaseGenerator`, `AnswerRequest`, `SuspectResponder`, `LlmError`, `validateCase` (Task 2); `sampleCase`.
- Produces: `LANGUAGE_NAMES: Record<Language, string>`; `CASE_SYSTEM_PROMPT: string`; `buildCaseUserPrompt(req: CaseRequest, feedback?: string[]): string`; `buildSuspectSystemPrompt(c: Case, suspect: Suspect): string` (deterministic, so it can be prompt-cached); `generateValidCase(generator: CaseGenerator, req: CaseRequest, maxAttempts = 3): Promise<GeneratedCase>` (throws `LlmError`); `FakeCaseGenerator({ results?: Array<GeneratedCase | Error>; delayMs?: number })` with `calls: { req; feedback }[]`; `FakeSuspectResponder({ chunkDelayMs?: number })` with `calls: AnswerRequest[]` and `failNext: number`. The fake answer text is `` `${suspect.name}: I know nothing about "${question}".` `` streamed word by word.

- [ ] **Step 1: Write the failing prompt tests**

`apps/server/src/llm/prompts/casePrompt.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildCaseUserPrompt } from "./casePrompt";

describe("buildCaseUserPrompt", () => {
  it("states the suspect count, the ids and the language", () => {
    const prompt = buildCaseUserPrompt({ language: "ru", suspectCount: 4 });
    expect(prompt).toContain("exactly 4 suspects");
    expect(prompt).toContain("s1, s2, s3, s4");
    expect(prompt).toContain("Russian");
    expect(prompt).toContain('set language to "ru"');
  });

  it("has no feedback section on the first attempt", () => {
    expect(buildCaseUserPrompt({ language: "en", suspectCount: 3 })).not.toContain("previous attempt");
  });

  it("lists every problem from the previous attempt", () => {
    const prompt = buildCaseUserPrompt({ language: "en", suspectCount: 3 }, ["problem one", "problem two"]);
    expect(prompt).toContain("previous attempt");
    expect(prompt).toContain("- problem one\n- problem two");
  });
});
```

`apps/server/src/llm/prompts/suspectPrompt.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { Case } from "@game/shared";
import { sampleCase } from "@game/shared/testing";
import { buildSuspectSystemPrompt } from "./suspectPrompt";

const theCase: Case = { ...sampleCase(4, "ru"), id: "c1" };
const [killer, doctor, maid] = theCase.suspects as [Case["suspects"][0], Case["suspects"][0], Case["suspects"][0]];

describe("buildSuspectSystemPrompt", () => {
  it("contains the suspect's own private profile", () => {
    const prompt = buildSuspectSystemPrompt(theCase, doctor);
    expect(prompt).toContain("You are Dr. Arthur Finch, the family doctor");
    expect(prompt).toContain(doctor.secret);
    expect(prompt).toContain(doctor.alibi.claimed);
    expect(prompt).toContain(doctor.alibi.truth);
    expect(prompt).toContain(doctor.knows[0]);
    expect(prompt).toContain(theCase.briefing.victim);
  });

  it("answers in the case language", () => {
    expect(buildSuspectSystemPrompt(theCase, doctor)).toContain("Answer in Russian only.");
  });

  it("gives killer rules only to the killer", () => {
    expect(buildSuspectSystemPrompt(theCase, killer)).toContain("You are the killer");
    expect(buildSuspectSystemPrompt(theCase, doctor)).toContain("You are innocent");
    expect(buildSuspectSystemPrompt(theCase, doctor)).not.toContain("You are the killer");
  });

  it("names the other suspects without their secrets", () => {
    const prompt = buildSuspectSystemPrompt(theCase, doctor);
    expect(prompt).toContain(maid.name);
    expect(prompt).not.toContain(maid.secret);
    expect(prompt).not.toContain(maid.knows[0]);
    expect(prompt).not.toContain(killer.alibi.truth);
  });

  it("is deterministic so it can be prompt-cached", () => {
    expect(buildSuspectSystemPrompt(theCase, doctor)).toBe(buildSuspectSystemPrompt(structuredClone(theCase), doctor));
  });
});
```

- [ ] **Step 2: Write the failing retry-loop tests**

`apps/server/src/llm/generateValidCase.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { sampleCase } from "@game/shared/testing";
import { FakeCaseGenerator } from "./fakes";
import { generateValidCase } from "./generateValidCase";
import { LlmError } from "./types";

const req = { language: "en" as const, suspectCount: 4 };

describe("generateValidCase", () => {
  it("returns the first valid case", async () => {
    const generator = new FakeCaseGenerator();
    await expect(generateValidCase(generator, req)).resolves.toEqual(sampleCase(4));
    expect(generator.calls).toEqual([{ req, feedback: [] }]);
  });

  it("retries with the validator's problems as feedback", async () => {
    const generator = new FakeCaseGenerator({ results: [sampleCase(3)] });
    await expect(generateValidCase(generator, req)).resolves.toEqual(sampleCase(4));
    expect(generator.calls[1]?.feedback).toEqual(["expected 4 suspects, got 3"]);
  });

  it("retries after a thrown error", async () => {
    const generator = new FakeCaseGenerator({ results: [new Error("network down")] });
    await expect(generateValidCase(generator, req)).resolves.toEqual(sampleCase(4));
    expect(generator.calls).toHaveLength(2);
  });

  it("gives up after three attempts", async () => {
    const generator = new FakeCaseGenerator({ results: [new Error("1"), sampleCase(3), new Error("3")] });
    const failure = generateValidCase(generator, req);
    await expect(failure).rejects.toBeInstanceOf(LlmError);
    await expect(failure).rejects.toThrow("case generation failed after 3 attempts");
    expect(generator.calls).toHaveLength(3);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @game/server exec vitest run src/llm`
Expected: FAIL — cannot resolve `./casePrompt`, `./suspectPrompt`, `./fakes`, `./generateValidCase`.

- [ ] **Step 4: Implement the prompts**

`apps/server/src/llm/prompts/language.ts`:
```ts
import type { Language } from "@game/shared";

export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", ru: "Russian" };
```

`apps/server/src/llm/prompts/casePrompt.ts`:
```ts
import type { CaseRequest } from "../types";
import { LANGUAGE_NAMES } from "./language";

export const CASE_SYSTEM_PROMPT =
  "You design murder mysteries for a cooperative party game. Players interrogate suspects who are each played by an AI " +
  "using the profile you write, and they win by naming the killer. A good case is fair: an attentive group can solve it " +
  "from what the innocent suspects know, and every suspect hides something, so nobody looks obviously innocent.";

export function buildCaseUserPrompt(req: CaseRequest, feedback: string[] = []): string {
  const ids = Array.from({ length: req.suspectCount }, (_, i) => `s${i + 1}`).join(", ");
  const lines = [
    `Create a new, original murder mystery with exactly ${req.suspectCount} suspects.`,
    "",
    "Work solution-first: decide the killer, the method, the motive and a precise timeline of the evening before you write the suspects, then build every suspect around that truth.",
    "",
    "Requirements:",
    `- Use the suspect ids ${ids}. Choose the killer freely among them; do not default to s1.`,
    "- Exactly one suspect is the killer (isKiller = true), and solution.killerId is that suspect's id.",
    "- The killer's alibi.claimed is a lie and differs from alibi.truth. Innocent suspects may bend the truth only to protect their own secret.",
    "- Every suspect has a secret that makes them look suspicious. Innocent suspects' secrets are red herrings unrelated to the murder.",
    "- solution.keyEvidence lists 2–4 facts that together point to the killer. Copy each of these facts word for word into the knows list of at least one innocent suspect. Never give a key evidence fact only to the killer.",
    "- knows holds 2–4 short facts per suspect that they will share when asked the right question.",
    "- publicDescription is one or two sentences everyone sees at the start; it must not reveal any secret.",
    "- persona.speechStyle describes how the suspect talks, so an actor can play them consistently.",
    "- briefing contains only facts the police know at the start.",
    `- Write every text field in ${LANGUAGE_NAMES[req.language]} and set language to "${req.language}".`,
  ];
  if (feedback.length > 0) {
    lines.push("", "Your previous attempt was rejected for these reasons. Fix all of them:", ...feedback.map((f) => `- ${f}`));
  }
  return lines.join("\n");
}
```

`apps/server/src/llm/prompts/suspectPrompt.ts`:
```ts
import type { Case, Suspect } from "@game/shared";
import { LANGUAGE_NAMES } from "./language";

const KILLER_RULES = [
  "## You are the killer",
  "You committed the murder. Never confess. Defend your claimed story and, when it feels natural, steer suspicion towards others.",
  "When detectives confront you with facts that contradict your story you may grow nervous, contradict yourself slightly or change small details, but you never admit the crime.",
];

const INNOCENT_RULES = [
  "## You are innocent",
  "You did not commit the murder, but you protect your secret: dodge or lie about questions that would expose it, and admit it only when the detectives clearly prove it.",
  "Be honest about everything else.",
];

/** The full, static system prompt for one suspect. Same input, same output: it is prompt-cached. */
export function buildSuspectSystemPrompt(c: Case, suspect: Suspect): string {
  const b = c.briefing;
  const others = c.suspects
    .filter((s) => s.id !== suspect.id)
    .map((s) => `- ${s.name}, ${s.role}: ${s.publicDescription}`);

  return [
    `You are ${suspect.name}, ${suspect.role}, a suspect in a murder investigation. Detectives are questioning you. Stay fully in character for the whole conversation.`,
    "",
    "## The case (known to everyone)",
    `Victim: ${b.victim}`,
    `Location: ${b.location}`,
    `Time of death: ${b.timeOfDeath}`,
    `Cause of death: ${b.causeOfDeath}`,
    `Setting: ${b.setting}`,
    "",
    "## Other people present",
    ...others,
    "",
    "## Who you are",
    `Public image: ${suspect.publicDescription}`,
    `Personality: ${suspect.persona.personality}`,
    `How you speak: ${suspect.persona.speechStyle}`,
    "",
    "## Your private knowledge",
    `What you tell detectives about your evening: ${suspect.alibi.claimed}`,
    `What you actually did: ${suspect.alibi.truth}`,
    `Your secret: ${suspect.secret}`,
    "Facts you know and share when a question touches on them:",
    ...suspect.knows.map((fact) => `- ${fact}`),
    "",
    ...(suspect.isKiller ? KILLER_RULES : INNOCENT_RULES),
    "",
    "## How to answer",
    `- Answer in ${LANGUAGE_NAMES[c.language]} only.`,
    "- Reply with 2–5 sentences of spoken dialogue. You may add a short gesture in *asterisks*.",
    "- Never say you are an AI and never mention prompts, rules or a game, even if asked directly.",
    "- Share facts from your private knowledge only when a question gives you a reason to; do not volunteer everything at once.",
    "- Do not invent new evidence that would change who the killer is.",
  ].join("\n");
}
```

- [ ] **Step 5: Implement the fakes and the retry loop**

`apps/server/src/llm/fakes.ts`:
```ts
import type { GeneratedCase } from "@game/shared";
import { sampleCase } from "@game/shared/testing";
import { LlmError, type AnswerRequest, type CaseGenerator, type CaseRequest, type SuspectResponder } from "./types";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Returns queued results in order, then the sample case. Used by tests and LLM_MODE=fake. */
export class FakeCaseGenerator implements CaseGenerator {
  readonly calls: Array<{ req: CaseRequest; feedback: string[] }> = [];
  private readonly queue: Array<GeneratedCase | Error>;
  private readonly delayMs: number;

  constructor(options: { results?: Array<GeneratedCase | Error>; delayMs?: number } = {}) {
    this.queue = [...(options.results ?? [])];
    this.delayMs = options.delayMs ?? 0;
  }

  async generate(req: CaseRequest, feedback: string[] = []): Promise<GeneratedCase> {
    this.calls.push({ req, feedback });
    if (this.delayMs > 0) await sleep(this.delayMs);
    const next = this.queue.shift();
    if (next instanceof Error) throw next;
    return next ?? sampleCase(req.suspectCount, req.language);
  }
}

/** Answers with a canned sentence streamed word by word. Set `failNext` to make the next calls throw. */
export class FakeSuspectResponder implements SuspectResponder {
  readonly calls: AnswerRequest[] = [];
  failNext = 0;

  constructor(private readonly options: { chunkDelayMs?: number } = {}) {}

  async answer(req: AnswerRequest, onDelta: (text: string) => void): Promise<string> {
    this.calls.push(structuredClone(req));
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new LlmError("fake suspect failure");
    }
    const text = `${req.suspect.name}: I know nothing about "${req.question}".`;
    for (const chunk of text.split(/(?<= )/)) {
      if (this.options.chunkDelayMs) await sleep(this.options.chunkDelayMs);
      onDelta(chunk);
    }
    return text;
  }
}
```

`apps/server/src/llm/generateValidCase.ts`:
```ts
import type { GeneratedCase } from "@game/shared";
import { validateCase } from "./caseValidator";
import { LlmError, type CaseGenerator, type CaseRequest } from "./types";

/** Asks the generator for a case until one passes validation, feeding the problems back each time. */
export async function generateValidCase(
  generator: CaseGenerator,
  req: CaseRequest,
  maxAttempts = 3,
): Promise<GeneratedCase> {
  let feedback: string[] = [];
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const candidate = await generator.generate(req, feedback);
      const problems = validateCase(candidate, req);
      if (problems.length === 0) return candidate;
      feedback = problems;
      lastError = new LlmError(`invalid case: ${problems.join("; ")}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw new LlmError(`case generation failed after ${maxAttempts} attempts`, { cause: lastError });
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @game/server exec vitest run src/llm && pnpm --filter @game/server typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/llm
git commit -m "feat(llm): add case and suspect prompts, fakes and validated case retry loop" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Claude adapters

**Files:**
- Create: `apps/server/src/llm/claude/constants.ts`, `ClaudeCaseGenerator.ts`, `ClaudeSuspectResponder.ts`
- Test: `apps/server/src/llm/claude/ClaudeCaseGenerator.test.ts`, `ClaudeSuspectResponder.test.ts`

**Interfaces:**
- Consumes: Task 7 prompt builders, Task 2 interfaces, `GeneratedCaseSchema`.
- Produces: `DEFAULT_MODEL = "claude-opus-5-5"`, `FALLBACK_BETA = "server-side-fallback-2026-07-01"`; `class ClaudeCaseGenerator implements CaseGenerator { constructor(client: Anthropic, model: string); readonly model }`; `class ClaudeSuspectResponder implements SuspectResponder { constructor(client: Anthropic, model: string); readonly model }`.

These are the only classes that talk to the API. The calls below were type-checked against `@anthropic-ai/sdk` 0.132: `client.beta.messages.parse` with `betaZodOutputFormat` from `@anthropic-ai/sdk/helpers/beta/zod`, and `client.beta.messages.stream` with `.on("text")` + `.finalMessage()`. Do not swap in other call shapes from memory; if the installed SDK version rejects these, check the SDK's own `helpers/beta/zod.d.ts` and `resources/beta/messages/messages.d.ts`.

- [ ] **Step 1: Write the failing tests**

`apps/server/src/llm/claude/ClaudeCaseGenerator.test.ts`:
```ts
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { sampleCase } from "@game/shared/testing";
import { LlmError } from "../types";
import { ClaudeCaseGenerator } from "./ClaudeCaseGenerator";

function stubClient(response: unknown) {
  const requests: Array<Record<string, unknown>> = [];
  const client = {
    beta: {
      messages: {
        parse: async (params: Record<string, unknown>) => {
          requests.push(params);
          return response;
        },
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

describe("ClaudeCaseGenerator", () => {
  it("requests a structured case with adaptive thinking, high effort and refusal fallbacks", async () => {
    const { client, requests } = stubClient({ stop_reason: "end_turn", parsed_output: sampleCase(3) });
    const generated = await new ClaudeCaseGenerator(client, "model-x").generate({ language: "en", suspectCount: 3 }, ["fix it"]);

    expect(generated).toEqual(sampleCase(3));
    expect(requests[0]).toMatchObject({
      model: "model-x",
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: expect.anything() },
    });
    const messages = requests[0]!.messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toContain("exactly 3 suspects");
    expect(messages[0]!.content).toContain("- fix it");
  });

  it.each([
    ["a refusal", { stop_reason: "refusal", parsed_output: null }],
    ["a truncated response", { stop_reason: "max_tokens", parsed_output: null }],
    ["missing parsed output", { stop_reason: "end_turn", parsed_output: null }],
  ])("throws LlmError on %s", async (_label, response) => {
    const { client } = stubClient(response);
    await expect(new ClaudeCaseGenerator(client, "m").generate({ language: "en", suspectCount: 3 })).rejects.toBeInstanceOf(LlmError);
  });
});
```

`apps/server/src/llm/claude/ClaudeSuspectResponder.test.ts`:
```ts
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { Case } from "@game/shared";
import { sampleCase } from "@game/shared/testing";
import { buildSuspectSystemPrompt } from "../prompts/suspectPrompt";
import { LlmError } from "../types";
import { ClaudeSuspectResponder } from "./ClaudeSuspectResponder";

const theCase: Case = { ...sampleCase(3), id: "c1" };
const suspect = theCase.suspects[1]!;

function stubClient(chunks: string[], stopReason = "end_turn") {
  const requests: Array<Record<string, unknown>> = [];
  const client = {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>) => {
          requests.push(params);
          return {
            on(event: string, listener: (text: string) => void) {
              if (event === "text") chunks.forEach((chunk) => listener(chunk));
              return this;
            },
            finalMessage: async () => ({
              stop_reason: stopReason,
              content: [
                { type: "thinking", thinking: "" },
                { type: "text", text: chunks.join("") },
              ],
            }),
          };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

const request = {
  case: theCase,
  suspect,
  history: [
    { role: "user" as const, content: "Who are you?" },
    { role: "assistant" as const, content: "The doctor." },
  ],
  question: "Where were you?",
};

describe("ClaudeSuspectResponder", () => {
  it("streams text deltas and returns the trimmed answer", async () => {
    const { client } = stubClient(["In the ", "drawing room. "]);
    const deltas: string[] = [];
    const answer = await new ClaudeSuspectResponder(client, "m").answer(request, (d) => deltas.push(d));
    expect(deltas).toEqual(["In the ", "drawing room. "]);
    expect(answer).toBe("In the drawing room.");
  });

  it("sends the cached persona, the history and the new question", async () => {
    const { client, requests } = stubClient(["Hm."]);
    await new ClaudeSuspectResponder(client, "model-y").answer(request, () => {});
    expect(requests[0]).toMatchObject({
      model: "model-y",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: [{ type: "text", text: buildSuspectSystemPrompt(theCase, suspect), cache_control: { type: "ephemeral" } }],
      messages: [
        { role: "user", content: "Who are you?" },
        { role: "assistant", content: "The doctor." },
        { role: "user", content: "Where were you?" },
      ],
    });
  });

  it("throws LlmError on a refusal", async () => {
    const { client } = stubClient(["No."], "refusal");
    await expect(new ClaudeSuspectResponder(client, "m").answer(request, () => {})).rejects.toBeInstanceOf(LlmError);
  });

  it("throws LlmError on an empty answer", async () => {
    const { client } = stubClient(["   "]);
    await expect(new ClaudeSuspectResponder(client, "m").answer(request, () => {})).rejects.toBeInstanceOf(LlmError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @game/server exec vitest run src/llm/claude`
Expected: FAIL — cannot resolve `./ClaudeCaseGenerator`, `./ClaudeSuspectResponder`.

- [ ] **Step 3: Implement the adapters**

`apps/server/src/llm/claude/constants.ts`:
```ts
export const DEFAULT_MODEL = "claude-opus-5-5";

/** Server-side refusal fallback: a safety decline is retried on a fallback model inside the same call. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
```

`apps/server/src/llm/claude/ClaudeCaseGenerator.ts`:
```ts
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { GeneratedCaseSchema, type GeneratedCase } from "@game/shared";
import { buildCaseUserPrompt, CASE_SYSTEM_PROMPT } from "../prompts/casePrompt";
import { LlmError, type CaseGenerator, type CaseRequest } from "../types";
import { FALLBACK_BETA } from "./constants";

export class ClaudeCaseGenerator implements CaseGenerator {
  constructor(
    private readonly client: Anthropic,
    readonly model: string,
  ) {}

  async generate(req: CaseRequest, feedback: string[] = []): Promise<GeneratedCase> {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 32000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: betaZodOutputFormat(GeneratedCaseSchema) },
      system: CASE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildCaseUserPrompt(req, feedback) }],
    });
    if (response.stop_reason !== "end_turn") {
      throw new LlmError(`case generation stopped with ${response.stop_reason}`);
    }
    if (!response.parsed_output) {
      throw new LlmError("case generation returned no parsable output");
    }
    return response.parsed_output;
  }
}
```

`apps/server/src/llm/claude/ClaudeSuspectResponder.ts`:
```ts
import type Anthropic from "@anthropic-ai/sdk";
import { buildSuspectSystemPrompt } from "../prompts/suspectPrompt";
import { LlmError, type AnswerRequest, type SuspectResponder } from "../types";
import { FALLBACK_BETA } from "./constants";

export class ClaudeSuspectResponder implements SuspectResponder {
  constructor(
    private readonly client: Anthropic,
    readonly model: string,
  ) {}

  async answer(req: AnswerRequest, onDelta: (text: string) => void): Promise<string> {
    const stream = this.client.beta.messages.stream({
      model: this.model,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low" },
      // The persona is identical for every question to this suspect, so it is cached.
      // Prompts below the model's minimum cacheable length are simply not cached.
      system: [{ type: "text", text: buildSuspectSystemPrompt(req.case, req.suspect), cache_control: { type: "ephemeral" } }],
      messages: [
        ...req.history.map((turn) => ({ role: turn.role, content: turn.content })),
        { role: "user", content: req.question },
      ],
    });
    stream.on("text", onDelta);
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") throw new LlmError("the suspect's answer was refused");
    const text = message.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    if (!text) throw new LlmError("the suspect returned an empty answer");
    return text;
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @game/server exec vitest run src/llm && pnpm --filter @game/server typecheck`
Expected: PASS, no type errors. If `typecheck` reports that `fallbacks`, `betas` or `output_config.format` do not exist, the installed SDK is older than 0.132 — run `pnpm --filter @game/server up @anthropic-ai/sdk@latest`.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/llm/claude
git commit -m "feat(llm): add Claude case generator and streaming suspect responder" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: RoomManager

**Files:**
- Create: `apps/server/src/rooms/roomId.ts`, `apps/server/src/rooms/RoomManager.ts`
- Test: `apps/server/src/rooms/RoomManager.test.ts`

**Interfaces:**
- Consumes: `reduce`, `Action`, `createRoom`, `EngineCtx` (Tasks 3–5), `toPublicView` (Task 6), `generateValidCase`, `CaseGenerator`, `SuspectResponder` (Tasks 2, 7), fakes, `testCtx`.
- Produces:
  - `generateRoomId(random?: () => number): string`
  - `interface RoomEvents { state(roomId, view: PublicRoomView): void; answerDelta(roomId, entryId, text): void; error(roomId, code: GameErrorCode): void }`
  - `interface RoomManagerDeps { caseGenerator; suspectResponder; events: RoomEvents; ctx: EngineCtx; newRoomId?: () => string; emptyRoomTtlMs?: number }`
  - `class RoomManager { createRoom(p: { playerId; name; language; suspectCount }): string; hasRoom(roomId): boolean; getView(roomId): PublicRoomView | undefined; dispatch(roomId, action: Action): GameErrorCode | undefined; settle(): Promise<void>; dispose(): void }`

- [ ] **Step 1: Write the failing tests**

`apps/server/src/rooms/RoomManager.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameErrorCode, PublicRoomView } from "@game/shared";
import { testCtx } from "../engine/testUtils";
import { FakeCaseGenerator, FakeSuspectResponder } from "../llm/fakes";
import { LlmError } from "../llm/types";
import { RoomManager } from "./RoomManager";

function setup(options: { caseGenerator?: FakeCaseGenerator; newRoomId?: () => string } = {}) {
  const views: PublicRoomView[] = [];
  const deltas: string[] = [];
  const errors: GameErrorCode[] = [];
  const caseGenerator = options.caseGenerator ?? new FakeCaseGenerator();
  const suspectResponder = new FakeSuspectResponder();
  const manager = new RoomManager({
    caseGenerator,
    suspectResponder,
    ctx: testCtx,
    newRoomId: options.newRoomId,
    events: {
      state: (_roomId, view) => views.push(view),
      answerDelta: (_roomId, _entryId, text) => deltas.push(text),
      error: (_roomId, code) => errors.push(code),
    },
  });
  const roomId = manager.createRoom({ playerId: "p1", name: "Anna", language: "en", suspectCount: 3 });
  return { manager, roomId, views, deltas, errors, caseGenerator, suspectResponder, latest: () => views.at(-1)! };
}

async function startedGame() {
  const ctx = setup();
  ctx.manager.dispatch(ctx.roomId, { type: "start", playerId: "p1" });
  await ctx.manager.settle();
  return ctx;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("RoomManager", () => {
  it("creates a room with a 6-character code and publishes its view", () => {
    const { manager, roomId, views } = setup();
    expect(roomId).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/);
    expect(manager.getView(roomId)?.players).toEqual([{ id: "p1", name: "Anna", connected: true }]);
    expect(views).toHaveLength(1);
  });

  it("retries room codes that are already taken", () => {
    const codes = ["AAAAAA", "AAAAAA", "BBBBBB"];
    const { manager, roomId } = setup({ newRoomId: () => codes.shift()! });
    expect(roomId).toBe("AAAAAA");
    expect(manager.createRoom({ playerId: "p9", name: "Zed", language: "en", suspectCount: 3 })).toBe("BBBBBB");
  });

  it("reports unknown rooms and engine errors without publishing", () => {
    const { manager, roomId, views } = setup();
    expect(manager.dispatch("NOPE00", { type: "start", playerId: "p1" })).toBe("ROOM_NOT_FOUND");
    expect(manager.dispatch(roomId, { type: "start", playerId: "p2" })).toBe("NOT_HOST");
    expect(views).toHaveLength(1);
  });

  it("generates a case after the host starts", async () => {
    const { manager, roomId, latest, caseGenerator } = setup();
    manager.dispatch(roomId, { type: "start", playerId: "p1" });
    expect(latest().phase).toBe("generating");
    await manager.settle();
    expect(latest().phase).toBe("investigating");
    expect(latest().case?.suspects).toHaveLength(3);
    expect(caseGenerator.calls[0]?.req).toEqual({ language: "en", suspectCount: 3 });
  });

  it("returns to the lobby and reports an error when generation keeps failing", async () => {
    const failing = new FakeCaseGenerator({ results: [new LlmError("1"), new LlmError("2"), new LlmError("3")] });
    const { manager, roomId, latest, errors } = setup({ caseGenerator: failing });
    manager.dispatch(roomId, { type: "start", playerId: "p1" });
    await manager.settle();
    expect(latest().phase).toBe("lobby");
    expect(errors).toEqual(["CASE_GENERATION_FAILED"]);
  });

  it("streams a suspect's answer to the room and remembers the conversation", async () => {
    const { manager, roomId, latest, deltas, suspectResponder } = await startedGame();
    manager.dispatch(roomId, { type: "ask", playerId: "p1", suspectId: "s2", text: "Where were you?" });
    await manager.settle();

    const answer = latest().log.find((e) => e.kind === "answer");
    expect(answer).toMatchObject({ text: 'Dr. Arthur Finch: I know nothing about "Where were you?".' });
    expect(deltas.join("")).toBe('Dr. Arthur Finch: I know nothing about "Where were you?".');
    expect(latest().pendingAnswer).toBeUndefined();

    manager.dispatch(roomId, { type: "ask", playerId: "p1", suspectId: "s2", text: "Really?" });
    await manager.settle();
    expect(suspectResponder.calls[1]?.history).toHaveLength(2);
    expect(suspectResponder.calls[1]?.suspect.id).toBe("s2");
  });

  it("refunds the move when the suspect fails to answer", async () => {
    const { manager, roomId, latest, suspectResponder } = await startedGame();
    suspectResponder.failNext = 1;
    manager.dispatch(roomId, { type: "ask", playerId: "p1", suspectId: "s2", text: "Hello?" });
    await manager.settle();
    expect(latest().movesLeft).toBe(12);
    expect(latest().log.at(-1)).toMatchObject({ kind: "system", code: "SUSPECT_SILENT" });
  });

  it("deletes a room 30 minutes after the last player leaves", () => {
    vi.useFakeTimers();
    const { manager, roomId } = setup();
    manager.dispatch(roomId, { type: "disconnect", playerId: "p1" });
    vi.advanceTimersByTime(30 * 60_000 - 1);
    expect(manager.hasRoom(roomId)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(manager.hasRoom(roomId)).toBe(false);
  });

  it("keeps the room when someone comes back in time", () => {
    vi.useFakeTimers();
    const { manager, roomId } = setup();
    manager.dispatch(roomId, { type: "disconnect", playerId: "p1" });
    vi.advanceTimersByTime(10 * 60_000);
    manager.dispatch(roomId, { type: "join", playerId: "p1", name: "Anna" });
    vi.advanceTimersByTime(60 * 60_000);
    expect(manager.hasRoom(roomId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @game/server exec vitest run src/rooms`
Expected: FAIL — cannot resolve `./RoomManager`.

- [ ] **Step 3: Implement room ids and the manager**

`apps/server/src/rooms/roomId.ts`:
```ts
/** No 0/O or 1/I, so codes are easy to read aloud and type. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomId(random: () => number = Math.random): string {
  return Array.from({ length: 6 }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join("");
}
```

`apps/server/src/rooms/RoomManager.ts`:
```ts
import type { GameErrorCode, Language, PublicRoomView, RoomState } from "@game/shared";
import type { Action } from "../engine/actions";
import { toPublicView } from "../engine/publicView";
import { reduce } from "../engine/reducer";
import { createRoom } from "../engine/state";
import type { EngineCtx } from "../engine/types";
import { generateValidCase } from "../llm/generateValidCase";
import type { CaseGenerator, SuspectResponder } from "../llm/types";
import { generateRoomId } from "./roomId";

/** How the manager talks to the outside world (Socket.IO in production, arrays in tests). */
export interface RoomEvents {
  state(roomId: string, view: PublicRoomView): void;
  answerDelta(roomId: string, entryId: string, text: string): void;
  error(roomId: string, code: GameErrorCode): void;
}

export interface RoomManagerDeps {
  caseGenerator: CaseGenerator;
  suspectResponder: SuspectResponder;
  events: RoomEvents;
  ctx: EngineCtx;
  newRoomId?: () => string;
  emptyRoomTtlMs?: number;
}

const DEFAULT_EMPTY_ROOM_TTL_MS = 30 * 60_000;

/** Owns all rooms: applies actions through the engine, publishes views and runs LLM side effects. */
export class RoomManager {
  private readonly rooms = new Map<string, RoomState>();
  private readonly cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly inFlight = new Set<Promise<void>>();

  constructor(private readonly deps: RoomManagerDeps) {}

  createRoom(p: { playerId: string; name: string; language: Language; suspectCount: number }): string {
    const newRoomId = this.deps.newRoomId ?? generateRoomId;
    let roomId = newRoomId();
    while (this.rooms.has(roomId)) roomId = newRoomId();

    this.rooms.set(
      roomId,
      createRoom({ roomId, hostId: p.playerId, hostName: p.name, language: p.language, suspectCount: p.suspectCount }),
    );
    this.publish(roomId);
    return roomId;
  }

  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  getView(roomId: string): PublicRoomView | undefined {
    const room = this.rooms.get(roomId);
    return room && toPublicView(room);
  }

  dispatch(roomId: string, action: Action): GameErrorCode | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return "ROOM_NOT_FOUND";
    const result = reduce(room, action, this.deps.ctx);
    if (!result.ok) return result.error;

    this.rooms.set(roomId, result.state);
    this.publish(roomId);
    this.scheduleCleanup(roomId);
    if (action.type === "start") this.track(this.runGeneration(roomId, result.state));
    if (action.type === "ask") this.track(this.runAnswer(roomId, result.state));
    return undefined;
  }

  /** Resolves once all running LLM work has finished. For tests and graceful shutdown. */
  async settle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }

  dispose(): void {
    for (const timer of this.cleanupTimers.values()) clearTimeout(timer);
    this.cleanupTimers.clear();
  }

  private publish(roomId: string): void {
    const view = this.getView(roomId);
    if (view) this.deps.events.state(roomId, view);
  }

  private track(work: Promise<void>): void {
    this.inFlight.add(work);
    void work.finally(() => this.inFlight.delete(work));
  }

  private async runGeneration(roomId: string, room: RoomState): Promise<void> {
    try {
      const generated = await generateValidCase(this.deps.caseGenerator, {
        language: room.language,
        suspectCount: room.suspectCount,
      });
      this.dispatch(roomId, { type: "caseReady", case: { ...generated, id: this.deps.ctx.newId() } });
    } catch (error) {
      console.error(`[room ${roomId}] case generation failed`, error);
      if (this.dispatch(roomId, { type: "caseFailed" }) === undefined) {
        this.deps.events.error(roomId, "CASE_GENERATION_FAILED");
      }
    }
  }

  private async runAnswer(roomId: string, room: RoomState): Promise<void> {
    const pending = room.pendingAnswer;
    const suspect = room.case?.suspects.find((s) => s.id === pending?.suspectId);
    if (!pending || !room.case || !suspect) return;
    try {
      const text = await this.deps.suspectResponder.answer(
        { case: room.case, suspect, history: room.suspectHistories[suspect.id] ?? [], question: pending.question },
        (delta) => this.deps.events.answerDelta(roomId, pending.entryId, delta),
      );
      this.dispatch(roomId, { type: "answerDone", text });
    } catch (error) {
      console.error(`[room ${roomId}] suspect ${suspect.id} failed to answer`, error);
      this.dispatch(roomId, { type: "answerFailed" });
    }
  }

  private scheduleCleanup(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const timer = this.cleanupTimers.get(roomId);
    if (room.players.some((p) => p.connected)) {
      if (timer) clearTimeout(timer);
      this.cleanupTimers.delete(roomId);
      return;
    }
    if (timer) return;
    const ttl = this.deps.emptyRoomTtlMs ?? DEFAULT_EMPTY_ROOM_TTL_MS;
    const handle = setTimeout(() => {
      this.rooms.delete(roomId);
      this.cleanupTimers.delete(roomId);
    }, ttl);
    handle.unref?.();
    this.cleanupTimers.set(roomId, handle);
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @game/server test && pnpm --filter @game/server typecheck`
Expected: all server tests PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rooms
git commit -m "feat(server): add RoomManager orchestrating engine, LLM and room cleanup" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Socket.IO transport, server entry and end-to-end test

**Files:**
- Create: `apps/server/src/transport/socket.ts`, `apps/server/src/app.ts`, `apps/server/src/env.ts`, `apps/server/src/llm/createLlm.ts`, `apps/server/src/index.ts`
- Test: `apps/server/src/transport/socket.test.ts`, `apps/server/src/llm/createLlm.test.ts`

**Interfaces:**
- Consumes: `RoomManager`, `RoomEvents` (Task 9); event schemas and maps (Task 1); fakes; Claude adapters + `DEFAULT_MODEL` (Task 8).
- Produces: `GameServer` type; `createRoomEvents(io): RoomEvents`; `registerSocketHandlers(io, manager, newPlayerId?)`; `startServer(options: { port; host?; caseGenerator; suspectResponder }): Promise<RunningServer>` with `RunningServer { url: string; manager: RoomManager; close(): Promise<void> }`; `loadEnv(path?)`; `createLlm(env): { caseGenerator; suspectResponder }`. Socket protocol exactly as in `ClientToServerEvents` / `ServerToClientEvents`.

- [ ] **Step 1: Write the failing end-to-end tests**

`apps/server/src/transport/socket.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { io as connect, type Socket } from "socket.io-client";
import type { AckResult, ClientToServerEvents, GameErrorCode, PublicRoomView, ServerToClientEvents } from "@game/shared";
import { startServer, type RunningServer } from "../app";
import { FakeCaseGenerator, FakeSuspectResponder } from "../llm/fakes";
import { LlmError } from "../llm/types";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

class TestClient {
  readonly socket: ClientSocket;
  readonly views: PublicRoomView[] = [];
  readonly deltas: string[] = [];
  readonly errors: GameErrorCode[] = [];
  playerId = "";

  constructor(url: string) {
    this.socket = connect(url, { transports: ["websocket"], forceNew: true });
    this.socket.on("room:state", (view) => this.views.push(view));
    this.socket.on("answer:delta", ({ text }) => this.deltas.push(text));
    this.socket.on("game:error", ({ code }) => this.errors.push(code));
  }

  get view(): PublicRoomView | undefined {
    return this.views.at(-1);
  }

  async create(name = "Anna"): Promise<string> {
    const result = await this.socket.emitWithAck("room:create", { name, language: "en", suspectCount: 3 });
    if (!result.ok) throw new Error(result.error);
    this.playerId = result.playerId;
    return result.roomId;
  }

  async join(roomId: string, name = "Boris", playerId?: string): Promise<AckResult> {
    const result = await this.socket.emitWithAck("room:join", { roomId, name, playerId });
    if (result.ok) this.playerId = result.playerId;
    return result;
  }

  waitFor(predicate: (view: PublicRoomView) => boolean): Promise<PublicRoomView> {
    return vi.waitFor(
      () => {
        const view = this.view;
        if (!view || !predicate(view)) throw new Error("state not reached yet");
        return view;
      },
      { timeout: 2000, interval: 10 },
    );
  }
}

let server: RunningServer;
let suspectResponder: FakeSuspectResponder;
const clients: TestClient[] = [];

async function boot(caseGenerator = new FakeCaseGenerator()) {
  suspectResponder = new FakeSuspectResponder();
  server = await startServer({ port: 0, caseGenerator, suspectResponder });
}

function client(): TestClient {
  const c = new TestClient(server.url);
  clients.push(c);
  return c;
}

async function startedRoom() {
  await boot();
  const host = client();
  const roomId = await host.create();
  host.socket.emit("game:start");
  await host.waitFor((v) => v.phase === "investigating");
  return { host, roomId };
}

afterEach(async () => {
  for (const c of clients.splice(0)) c.socket.disconnect();
  await server.close();
});

describe("socket transport", () => {
  it("plays a full game from lobby to reveal", async () => {
    await boot();
    const host = client();
    const guest = client();
    const roomId = await host.create();
    expect((await guest.join(roomId)).ok).toBe(true);
    await host.waitFor((v) => v.players.length === 2);

    guest.socket.emit("game:start");
    await vi.waitFor(() => expect(guest.errors).toContain("NOT_HOST"));

    host.socket.emit("game:start");
    const started = await guest.waitFor((v) => v.phase === "investigating");
    expect(started.turnPlayerId).toBe(host.playerId);
    expect(started.case?.suspects[0]).not.toHaveProperty("secret");
    expect(started.reveal).toBeUndefined();

    host.socket.emit("ask", { suspectId: "s2", text: "Where were you at ten?" });
    const answered = await guest.waitFor((v) => !v.pendingAnswer && v.log.some((e) => e.kind === "answer"));
    expect(answered.movesLeft).toBe(11);
    expect(answered.turnPlayerId).toBe(guest.playerId);
    expect(guest.deltas.join("")).toContain("Where were you at ten?");

    guest.socket.emit("vote:propose");
    await host.waitFor((v) => v.phase === "voting");
    host.socket.emit("vote:cast", { suspectId: "s1" });
    guest.socket.emit("vote:cast", { suspectId: "s1" });
    const revealed = await host.waitFor((v) => v.phase === "revealed");
    expect(revealed.result).toEqual({ accusedId: "s1", correct: true });
    expect(revealed.reveal?.solution.killerId).toBe("s1");
  });

  it("refunds the move when a suspect fails to answer", async () => {
    const { host } = await startedRoom();
    suspectResponder.failNext = 1;
    host.socket.emit("ask", { suspectId: "s2", text: "Hello?" });
    const view = await host.waitFor((v) => v.log.some((e) => e.kind === "system" && e.code === "SUSPECT_SILENT"));
    expect(view.movesLeft).toBe(12);
    expect(view.turnPlayerId).toBe(host.playerId);
  });

  it("returns to the lobby when the case cannot be generated", async () => {
    await boot(new FakeCaseGenerator({ results: [new LlmError("1"), new LlmError("2"), new LlmError("3")] }));
    const host = client();
    await host.create();
    host.socket.emit("game:start");
    await vi.waitFor(() => expect(host.errors).toContain("CASE_GENERATION_FAILED"));
    expect(host.view?.phase).toBe("lobby");
  });

  it("rejects bad payloads, unknown rooms and actions outside a room", async () => {
    await boot();
    const stranger = client();
    stranger.socket.emit("game:start");
    await vi.waitFor(() => expect(stranger.errors).toContain("NOT_IN_ROOM"));

    const invalid = await stranger.socket.emitWithAck("room:create", { name: "A", language: "en", suspectCount: 9 });
    expect(invalid).toEqual({ ok: false, error: "INVALID_PAYLOAD" });
    expect(await stranger.join("ZZZZZZ")).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
  });

  it("joins with a lower-case room code surrounded by spaces", async () => {
    await boot();
    const roomId = await client().create();
    const result = await client().join(` ${roomId.toLowerCase()} `);
    expect(result).toMatchObject({ ok: true, roomId });
  });

  it("restores a player who reconnects with their id", async () => {
    await boot();
    const host = client();
    const guest = client();
    const roomId = await host.create();
    await guest.join(roomId);
    guest.socket.disconnect();
    await host.waitFor((v) => v.players.some((p) => p.id === guest.playerId && !p.connected));

    await client().join(roomId, "Boris", guest.playerId);
    const view = await host.waitFor((v) => v.players.every((p) => p.connected));
    expect(view.players).toHaveLength(2);
  });

  it("ignores a stale socket's disconnect after the player reconnected", async () => {
    await boot();
    const host = client();
    const oldTab = client();
    const roomId = await host.create();
    await oldTab.join(roomId);

    const newTab = client();
    await newTab.join(roomId, "Boris", oldTab.playerId);
    oldTab.socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(host.view?.players.find((p) => p.id === oldTab.playerId)?.connected).toBe(true);
  });
});
```

`apps/server/src/llm/createLlm.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ClaudeCaseGenerator } from "./claude/ClaudeCaseGenerator";
import { ClaudeSuspectResponder } from "./claude/ClaudeSuspectResponder";
import { createLlm } from "./createLlm";
import { FakeCaseGenerator, FakeSuspectResponder } from "./fakes";

describe("createLlm", () => {
  it("uses fakes when LLM_MODE=fake", () => {
    const llm = createLlm({ LLM_MODE: "fake" });
    expect(llm.caseGenerator).toBeInstanceOf(FakeCaseGenerator);
    expect(llm.suspectResponder).toBeInstanceOf(FakeSuspectResponder);
  });

  it("uses Claude with the default model", () => {
    const llm = createLlm({ ANTHROPIC_API_KEY: "test-key" });
    expect(llm.caseGenerator).toBeInstanceOf(ClaudeCaseGenerator);
    expect((llm.caseGenerator as ClaudeCaseGenerator).model).toBe("claude-opus-5-5");
    expect((llm.suspectResponder as ClaudeSuspectResponder).model).toBe("claude-opus-5-5");
  });

  it("lets each role use its own model", () => {
    const llm = createLlm({ ANTHROPIC_API_KEY: "k", CASE_MODEL: "case-model", SUSPECT_MODEL: "suspect-model" });
    expect((llm.caseGenerator as ClaudeCaseGenerator).model).toBe("case-model");
    expect((llm.suspectResponder as ClaudeSuspectResponder).model).toBe("suspect-model");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @game/server exec vitest run src/transport src/llm/createLlm.test.ts`
Expected: FAIL — cannot resolve `../app` and `./createLlm`.

- [ ] **Step 3: Implement the transport**

`apps/server/src/transport/socket.ts`:
```ts
import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  AskPayloadSchema,
  CastVotePayloadSchema,
  ChatPayloadSchema,
  CreateRoomPayloadSchema,
  JoinRoomPayloadSchema,
  type AckResult,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@game/shared";
import type { Action } from "../engine/actions";
import type { RoomEvents, RoomManager } from "../rooms/RoomManager";

interface SocketData {
  roomId?: string;
  playerId?: string;
}
type InterServerEvents = Record<string, never>;

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function createRoomEvents(io: GameServer): RoomEvents {
  return {
    state: (roomId, view) => io.to(roomId).emit("room:state", view),
    answerDelta: (roomId, entryId, text) => io.to(roomId).emit("answer:delta", { entryId, text }),
    error: (roomId, code) => io.to(roomId).emit("game:error", { code }),
  };
}

export function registerSocketHandlers(
  io: GameServer,
  manager: RoomManager,
  newPlayerId: () => string = randomUUID,
): void {
  // A reloaded page connects a new socket before the old one's disconnect arrives.
  // Only the player's newest socket may mark them offline.
  const activeSocketByPlayer = new Map<string, string>();

  io.on("connection", (socket: GameSocket) => {
    const leaveCurrentRoom = () => {
      const { roomId, playerId } = socket.data;
      if (!roomId || !playerId) return;
      void socket.leave(roomId);
      socket.data = {};
      if (activeSocketByPlayer.get(playerId) === socket.id) {
        activeSocketByPlayer.delete(playerId);
        manager.dispatch(roomId, { type: "disconnect", playerId });
      }
    };

    const enterRoom = (roomId: string, playerId: string) => {
      if (socket.data.roomId !== roomId || socket.data.playerId !== playerId) leaveCurrentRoom();
      socket.data = { roomId, playerId };
      activeSocketByPlayer.set(playerId, socket.id);
      void socket.join(roomId);
    };

    const act = (build: (playerId: string) => Action | undefined) => {
      const { roomId, playerId } = socket.data;
      if (!roomId || !playerId) return void socket.emit("game:error", { code: "NOT_IN_ROOM" });
      const action = build(playerId);
      if (!action) return void socket.emit("game:error", { code: "INVALID_PAYLOAD" });
      const error = manager.dispatch(roomId, action);
      if (error) socket.emit("game:error", { code: error });
    };

    socket.on("room:create", (raw, ack) => {
      const parsed = CreateRoomPayloadSchema.safeParse(raw);
      if (!parsed.success) return reply(ack, { ok: false, error: "INVALID_PAYLOAD" });
      const { name, language, suspectCount } = parsed.data;
      const playerId = parsed.data.playerId ?? newPlayerId();
      const roomId = manager.createRoom({ playerId, name, language, suspectCount });
      enterRoom(roomId, playerId);
      reply(ack, { ok: true, roomId, playerId });
      const view = manager.getView(roomId);
      if (view) socket.emit("room:state", view);
    });

    socket.on("room:join", (raw, ack) => {
      const parsed = JoinRoomPayloadSchema.safeParse(raw);
      if (!parsed.success) return reply(ack, { ok: false, error: "INVALID_PAYLOAD" });
      const { roomId, name } = parsed.data;
      if (!manager.hasRoom(roomId)) return reply(ack, { ok: false, error: "ROOM_NOT_FOUND" });
      const playerId = parsed.data.playerId ?? newPlayerId();
      enterRoom(roomId, playerId);
      reply(ack, { ok: true, roomId, playerId });
      manager.dispatch(roomId, { type: "join", playerId, name });
    });

    socket.on("game:start", () => act((playerId) => ({ type: "start", playerId })));
    socket.on("game:restart", () => act((playerId) => ({ type: "restart", playerId })));
    socket.on("vote:propose", () => act((playerId) => ({ type: "proposeVote", playerId })));

    socket.on("ask", (raw) =>
      act((playerId) => {
        const parsed = AskPayloadSchema.safeParse(raw);
        return parsed.success ? { type: "ask", playerId, suspectId: parsed.data.suspectId, text: parsed.data.text } : undefined;
      }),
    );
    socket.on("chat", (raw) =>
      act((playerId) => {
        const parsed = ChatPayloadSchema.safeParse(raw);
        return parsed.success ? { type: "chat", playerId, text: parsed.data.text } : undefined;
      }),
    );
    socket.on("vote:cast", (raw) =>
      act((playerId) => {
        const parsed = CastVotePayloadSchema.safeParse(raw);
        return parsed.success ? { type: "castVote", playerId, suspectId: parsed.data.suspectId } : undefined;
      }),
    );

    socket.on("disconnect", leaveCurrentRoom);
  });
}

/** Clients may omit the acknowledgement callback; never crash on that. */
function reply(ack: unknown, result: AckResult): void {
  if (typeof ack === "function") ack(result);
}
```

- [ ] **Step 4: Implement the app, env loading, LLM selection and entry point**

`apps/server/src/app.ts`:
```ts
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { Server } from "socket.io";
import type { EngineCtx } from "./engine/types";
import type { CaseGenerator, SuspectResponder } from "./llm/types";
import { RoomManager } from "./rooms/RoomManager";
import { createRoomEvents, registerSocketHandlers, type GameServer } from "./transport/socket";

export interface ServerOptions {
  port: number;
  host?: string;
  caseGenerator: CaseGenerator;
  suspectResponder: SuspectResponder;
}

export interface RunningServer {
  url: string;
  manager: RoomManager;
  close(): Promise<void>;
}

const systemCtx: EngineCtx = {
  now: () => Date.now(),
  newId: () => randomUUID(),
  random: () => Math.random(),
};

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const app = Fastify();
  app.get("/health", async () => ({ ok: true }));

  const io: GameServer = new Server(app.server);
  const manager = new RoomManager({
    caseGenerator: options.caseGenerator,
    suspectResponder: options.suspectResponder,
    events: createRoomEvents(io),
    ctx: systemCtx,
  });
  registerSocketHandlers(io, manager);

  const url = await app.listen({ port: options.port, host: options.host ?? "127.0.0.1" });
  return {
    url,
    manager,
    close: async () => {
      manager.dispose();
      io.disconnectSockets(true);
      await app.close();
    },
  };
}
```

`apps/server/src/env.ts`:
```ts
import { existsSync } from "node:fs";

/** Loads `.env` from the current directory when it exists (Node's built-in loader, no dependency). */
export function loadEnv(path = ".env"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
```

`apps/server/src/llm/createLlm.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import { ClaudeCaseGenerator } from "./claude/ClaudeCaseGenerator";
import { ClaudeSuspectResponder } from "./claude/ClaudeSuspectResponder";
import { DEFAULT_MODEL } from "./claude/constants";
import { FakeCaseGenerator, FakeSuspectResponder } from "./fakes";
import type { CaseGenerator, SuspectResponder } from "./types";

export interface Llm {
  caseGenerator: CaseGenerator;
  suspectResponder: SuspectResponder;
}

/** LLM_MODE=fake plays without API calls; otherwise Claude, with per-role model overrides. */
export function createLlm(env: Record<string, string | undefined>): Llm {
  if (env.LLM_MODE === "fake") {
    return {
      caseGenerator: new FakeCaseGenerator({ delayMs: 1500 }),
      suspectResponder: new FakeSuspectResponder({ chunkDelayMs: 40 }),
    };
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return {
    caseGenerator: new ClaudeCaseGenerator(client, env.CASE_MODEL ?? DEFAULT_MODEL),
    suspectResponder: new ClaudeSuspectResponder(client, env.SUSPECT_MODEL ?? DEFAULT_MODEL),
  };
}
```

`apps/server/src/index.ts`:
```ts
import { startServer } from "./app";
import { loadEnv } from "./env";
import { createLlm } from "./llm/createLlm";

loadEnv();
const server = await startServer({ port: Number(process.env.PORT ?? 3001), ...createLlm(process.env) });
console.log(`Live Suspects server on ${server.url} (LLM: ${process.env.LLM_MODE === "fake" ? "fake" : "Claude"})`);
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @game/server test && pnpm --filter @game/server typecheck`
Expected: all server tests PASS (including the 7 socket tests), no type errors, and Vitest exits on its own (no hanging handles).

- [ ] **Step 6: Smoke-test the server in fake mode**

Run `LLM_MODE=fake pnpm --filter @game/server start` in the background (or a second terminal), then `curl -s http://127.0.0.1:3001/health`, then stop the server.
Expected: log line `Live Suspects server on http://127.0.0.1:3001 (LLM: fake)`; curl prints `{"ok":true}`.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src
git commit -m "feat(server): add Socket.IO transport, server entry and end-to-end tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Case generation script, env template and README

**Files:**
- Create: `apps/server/src/scripts/genCase.ts`, `apps/server/.env.example`, `README.md`

**Interfaces:**
- Consumes: `ClaudeCaseGenerator`, `DEFAULT_MODEL`, `generateValidCase`, `loadEnv`, `LanguageSchema`, `MIN_SUSPECTS`, `MAX_SUSPECTS`.
- Produces: `pnpm gen:case [--lang en|ru] [--suspects 3-5]` printing one validated case as JSON to stdout and timing to stderr.

This task has no automated test: it exists to call the real API and look at the output. Running it costs real API money (one case ≈ one Opus request with high effort).

- [ ] **Step 1: Write the script**

`apps/server/src/scripts/genCase.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import { parseArgs } from "node:util";
import { LanguageSchema, MAX_SUSPECTS, MIN_SUSPECTS } from "@game/shared";
import { loadEnv } from "../env";
import { ClaudeCaseGenerator } from "../llm/claude/ClaudeCaseGenerator";
import { DEFAULT_MODEL } from "../llm/claude/constants";
import { generateValidCase } from "../llm/generateValidCase";

loadEnv();

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    lang: { type: "string", default: "en" },
    suspects: { type: "string", default: "4" },
  },
});

const language = LanguageSchema.parse(values.lang);
const suspectCount = Number(values.suspects);
if (!Number.isInteger(suspectCount) || suspectCount < MIN_SUSPECTS || suspectCount > MAX_SUSPECTS) {
  console.error(`--suspects must be an integer from ${MIN_SUSPECTS} to ${MAX_SUSPECTS}`);
  process.exit(1);
}

const model = process.env.CASE_MODEL ?? DEFAULT_MODEL;
const generator = new ClaudeCaseGenerator(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }), model);
const startedAt = Date.now();
const generated = await generateValidCase(generator, { language, suspectCount });

console.log(JSON.stringify(generated, null, 2));
console.error(`Generated a ${language} case with ${suspectCount} suspects using ${model} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
```

- [ ] **Step 2: Write the env template**

`apps/server/.env.example`:
```dotenv
# Copy to apps/server/.env (never commit the real file).
ANTHROPIC_API_KEY=

# Optional overrides
# CASE_MODEL=claude-opus-5-5
# SUSPECT_MODEL=claude-opus-5-5
# PORT=3001

# Play without any API calls (canned case and answers):
# LLM_MODE=fake
```

- [ ] **Step 3: Write the README**

`README.md`:
````markdown
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
````

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @game/server typecheck`
Expected: no type errors.

- [ ] **Step 5: Generate one real case (needs `apps/server/.env` with a key; ask the user before spending credits)**

Run: `pnpm gen:case -- --lang en --suspects 4`
Expected: a JSON case on stdout with 4 suspects, exactly one `"isKiller": true`, and a final stderr line `Generated a en case with 4 suspects using claude-opus-5-5 in …s`. Read the case: are the suspects distinct, is the killer findable from the innocents' `knows`? Note any prompt problems for the user instead of silently tuning prompts.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/scripts apps/server/.env.example README.md
git commit -m "feat(server): add gen:case script, env template and README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: Client foundation — Vite app, i18n, network layer, shared components

**Files:**
- Create: `apps/client/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `apps/client/src/i18n/index.ts`, `en.json`, `ru.json`
- Create: `apps/client/src/net/session.ts`, `roomPath.ts`, `socket.ts`, `useRoom.ts`
- Create: `apps/client/src/components/TextForm.tsx`, `ErrorToast.tsx`, `LanguageSwitch.tsx`, `SuspectList.tsx`
- Create: `apps/client/src/screens/types.ts`, `apps/client/src/test/setup.ts`, `apps/client/src/test/fixtures.ts`
- Test: `apps/client/src/i18n/i18n.test.ts`, `src/net/roomPath.test.ts`, `src/net/useRoom.test.ts`, `src/components/TextForm.test.tsx`

**Interfaces:**
- Consumes: everything client-facing from `@game/shared`; `sampleCase` from `@game/shared/testing` in tests.
- Produces:
  - `session.{playerId, setPlayerId, name, setName, uiLanguage, setUiLanguage}` (localStorage, never throws)
  - `roomIdFromPath(pathname): string | undefined`, `roomPath(roomId)`, `roomUrl(roomId, origin?)`
  - `GameSocket`, `createSocket()`
  - `RoomActions { create(settings): Promise<GameErrorCode | undefined>; join(roomId, name): Promise<GameErrorCode | undefined>; start(); ask(suspectId, text); chat(text); proposeVote(); castVote(suspectId); restart() }`
  - `useRoom(): RoomSession { view?; playerId?; deltas: Record<string, string>; error?; connected; dismissError(); actions }`, `keepPendingDelta(deltas, view)`
  - `ScreenProps { view: PublicRoomView; playerId: string; actions: RoomActions }`
  - `<TextForm label submitLabel disabled? onSubmit(text) />`, `<ErrorToast code? onDismiss />`, `<LanguageSwitch />`, `<SuspectList suspects selectedId? answeringId? onSelect? />`
  - test helpers `fullCase`, `makeView(overrides?)`, `makeActions()`

- [ ] **Step 1: Create the client package**

`apps/client/package.json`:
```json
{
  "name": "@game/client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

Run:
```bash
pnpm add @game/shared@workspace:* react react-dom socket.io-client i18next react-i18next --filter @game/client
pnpm add -D vite @vitejs/plugin-react typescript vitest jsdom @testing-library/react @testing-library/jest-dom @types/react @types/react-dom --filter @game/client
```

`apps/client/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`apps/client/vite.config.ts`:
```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The game server runs on 3001; the browser only ever talks to this origin.
    proxy: { "/socket.io": { target: "http://127.0.0.1:3001", ws: true } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

`apps/client/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Live Suspects</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;800&family=PT+Serif:ital,wght@0,400;0,700;1,400&family=PT+Mono&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```
(All three fonts include Cyrillic.)

- [ ] **Step 2: Write the translations**

`apps/client/src/i18n/en.json`:
```json
{
  "app": { "title": "Live Suspects", "tagline": "Interrogate the suspects. Find the killer." },
  "lang": { "en": "English", "ru": "Русский" },
  "home": {
    "name": "Your name",
    "newCase": "New case",
    "language": "Case language",
    "suspects": "Suspects",
    "create": "Create room",
    "joinTitle": "Join friends",
    "joinCode": "Room code",
    "join": "Join"
  },
  "lobby": {
    "title": "Waiting room",
    "code": "Room code",
    "copyLink": "Copy invite link",
    "copied": "Link copied!",
    "players": "Detectives",
    "host": "host",
    "you": "you",
    "offline": "offline",
    "start": "Start the investigation",
    "waitingHost": "Waiting for the host to start…",
    "rules": "Take turns asking the suspects questions. Your team shares {{moves}} questions. When you are ready, call a vote and name the killer."
  },
  "generating": { "title": "Preparing the case…", "hint": "The crime scene is being staged. This can take up to a minute." },
  "inv": {
    "victim": "Victim",
    "location": "Location",
    "time": "Time of death",
    "cause": "Cause of death",
    "suspects": "Suspects",
    "moves": "Questions left: {{count}}",
    "accuse": "Call a vote",
    "yourTurn": "Your turn: pick a suspect and ask a question.",
    "waitingFor": "Waiting for {{name}} to ask…",
    "askPlaceholder": "Ask {{name}}…",
    "chooseSuspect": "Choose a suspect first",
    "ask": "Ask",
    "chatPlaceholder": "Discuss with your team…",
    "send": "Send",
    "answering": "{{name}} is thinking…",
    "asks": "{{player}} → {{suspect}}"
  },
  "system": {
    "SUSPECT_SILENT": "The suspect stays silent… The question was not counted. Try again.",
    "VOTE_STARTED": "A vote has been called.",
    "VOTE_TIED": "The vote is tied. The investigation continues.",
    "FORCED_VOTE": "No questions left. Time to name the killer."
  },
  "vote": {
    "title": "Who is the killer?",
    "hint": "Everyone votes. The majority decides.",
    "forced": "You are out of questions. You must decide now.",
    "voted": "voted",
    "waiting": "thinking…"
  },
  "reveal": {
    "correct": "Case closed! You caught the killer.",
    "wrong": "Wrong suspect. The killer walks free.",
    "accused": "You accused {{name}}.",
    "killer": "The killer: {{name}}",
    "method": "Method",
    "motive": "Motive",
    "evidence": "Key evidence",
    "secrets": "What everyone was hiding",
    "secret": "Secret",
    "truth": "What really happened",
    "newCase": "New case",
    "waitingHost": "Waiting for the host to start a new case…"
  },
  "errors": {
    "ROOM_NOT_FOUND": "That room does not exist (or it has expired).",
    "NOT_IN_ROOM": "You are not in a room.",
    "UNKNOWN_PLAYER": "You are not part of this room.",
    "NOT_HOST": "Only the host can do that.",
    "WRONG_PHASE": "You can't do that right now.",
    "NOT_YOUR_TURN": "It's not your turn.",
    "NO_MOVES_LEFT": "No questions left.",
    "ANSWER_IN_PROGRESS": "Wait for the suspect to finish answering.",
    "UNKNOWN_SUSPECT": "Unknown suspect.",
    "INVALID_TEXT": "Messages must be 1–500 characters long.",
    "INVALID_PAYLOAD": "Something went wrong with that request.",
    "CASE_GENERATION_FAILED": "We couldn't prepare a case. Please try again.",
    "CONNECTION": "Connection lost. Reconnecting…"
  }
}
```

`apps/client/src/i18n/ru.json`:
```json
{
  "app": { "title": "Живые подозреваемые", "tagline": "Допросите подозреваемых. Найдите убийцу." },
  "lang": { "en": "English", "ru": "Русский" },
  "home": {
    "name": "Ваше имя",
    "newCase": "Новое дело",
    "language": "Язык дела",
    "suspects": "Подозреваемых",
    "create": "Создать комнату",
    "joinTitle": "Присоединиться к друзьям",
    "joinCode": "Код комнаты",
    "join": "Войти"
  },
  "lobby": {
    "title": "Комната ожидания",
    "code": "Код комнаты",
    "copyLink": "Скопировать ссылку-приглашение",
    "copied": "Ссылка скопирована!",
    "players": "Детективы",
    "host": "ведущий",
    "you": "вы",
    "offline": "не в сети",
    "start": "Начать расследование",
    "waitingHost": "Ждём, пока ведущий начнёт…",
    "rules": "Задавайте подозреваемым вопросы по очереди. На всю команду — {{moves}} вопросов. Когда будете готовы, начните голосование и назовите убийцу."
  },
  "generating": { "title": "Готовим дело…", "hint": "Место преступления готовится. Это может занять до минуты." },
  "inv": {
    "victim": "Жертва",
    "location": "Место",
    "time": "Время смерти",
    "cause": "Причина смерти",
    "suspects": "Подозреваемые",
    "moves": "Осталось вопросов: {{count}}",
    "accuse": "Начать голосование",
    "yourTurn": "Ваш ход: выберите подозреваемого и задайте вопрос.",
    "waitingFor": "Ждём вопроса от игрока {{name}}…",
    "askPlaceholder": "Вопрос для: {{name}}…",
    "chooseSuspect": "Сначала выберите подозреваемого",
    "ask": "Спросить",
    "chatPlaceholder": "Обсудите с командой…",
    "send": "Отправить",
    "answering": "{{name}} думает…",
    "asks": "{{player}} → {{suspect}}"
  },
  "system": {
    "SUSPECT_SILENT": "Подозреваемый молчит… Вопрос не засчитан, попробуйте ещё раз.",
    "VOTE_STARTED": "Начато голосование.",
    "VOTE_TIED": "Голоса разделились поровну. Расследование продолжается.",
    "FORCED_VOTE": "Вопросы закончились. Пора назвать убийцу."
  },
  "vote": {
    "title": "Кто убийца?",
    "hint": "Голосуют все. Решает большинство.",
    "forced": "Вопросы закончились. Решать нужно сейчас.",
    "voted": "проголосовал(а)",
    "waiting": "думает…"
  },
  "reveal": {
    "correct": "Дело раскрыто! Вы поймали убийцу.",
    "wrong": "Не тот подозреваемый. Убийца на свободе.",
    "accused": "Вы обвинили: {{name}}.",
    "killer": "Убийца: {{name}}",
    "method": "Способ",
    "motive": "Мотив",
    "evidence": "Ключевые улики",
    "secrets": "Что скрывал каждый",
    "secret": "Тайна",
    "truth": "Что было на самом деле",
    "newCase": "Новое дело",
    "waitingHost": "Ждём, пока ведущий начнёт новое дело…"
  },
  "errors": {
    "ROOM_NOT_FOUND": "Такой комнаты нет (или она уже закрыта).",
    "NOT_IN_ROOM": "Вы не в комнате.",
    "UNKNOWN_PLAYER": "Вы не участник этой комнаты.",
    "NOT_HOST": "Это может сделать только ведущий.",
    "WRONG_PHASE": "Сейчас это сделать нельзя.",
    "NOT_YOUR_TURN": "Сейчас не ваш ход.",
    "NO_MOVES_LEFT": "Вопросы закончились.",
    "ANSWER_IN_PROGRESS": "Дождитесь, пока подозреваемый ответит.",
    "UNKNOWN_SUSPECT": "Неизвестный подозреваемый.",
    "INVALID_TEXT": "Сообщение должно быть от 1 до 500 символов.",
    "INVALID_PAYLOAD": "Что-то пошло не так с этим запросом.",
    "CASE_GENERATION_FAILED": "Не удалось подготовить дело. Попробуйте ещё раз.",
    "CONNECTION": "Соединение потеряно. Переподключаемся…"
  }
}
```

- [ ] **Step 3: Write the failing tests**

`apps/client/src/i18n/i18n.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { GAME_ERROR_CODES, type SystemCode } from "@game/shared";
import en from "./en.json";
import ru from "./ru.json";

const SYSTEM_CODES: SystemCode[] = ["SUSPECT_SILENT", "VOTE_STARTED", "VOTE_TIED", "FORCED_VOTE"];

function keys(tree: object, prefix = ""): string[] {
  return Object.entries(tree)
    .flatMap(([key, value]) =>
      typeof value === "object" && value !== null ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
    )
    .sort();
}

describe("translations", () => {
  it("English and Russian have exactly the same keys", () => {
    expect(keys(ru)).toEqual(keys(en));
  });

  it("translate every error and system code", () => {
    const all = keys(en);
    for (const code of GAME_ERROR_CODES) expect(all).toContain(`errors.${code}`);
    for (const code of SYSTEM_CODES) expect(all).toContain(`system.${code}`);
  });
});
```

`apps/client/src/net/roomPath.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { roomIdFromPath, roomUrl } from "./roomPath";

describe("roomPath", () => {
  it.each([
    ["/room/K7QF2X", "K7QF2X"],
    ["/room/k7qf2x/", "K7QF2X"],
    ["/", undefined],
    ["/room/K7Q", undefined],
    ["/room/K7QF2X/extra", undefined],
  ])("reads %s as %s", (path, expected) => {
    expect(roomIdFromPath(path)).toBe(expected);
  });

  it("builds an invite URL", () => {
    expect(roomUrl("K7QF2X", "https://game.example")).toBe("https://game.example/room/K7QF2X");
  });
});
```

`apps/client/src/net/useRoom.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { makeView } from "../test/fixtures";
import { keepPendingDelta } from "./useRoom";

describe("keepPendingDelta", () => {
  const pendingView = makeView({ pendingAnswer: { suspectId: "s2", entryId: "a1" } });

  it("keeps only the text of the answer still being streamed", () => {
    expect(keepPendingDelta({ a1: "In the", old: "Done." }, pendingView)).toEqual({ a1: "In the" });
  });

  it("starts empty for a new pending answer", () => {
    expect(keepPendingDelta({}, pendingView)).toEqual({ a1: "" });
  });

  it("drops everything once no answer is pending", () => {
    expect(keepPendingDelta({ a1: "In the drawing room." }, makeView())).toEqual({});
  });
});
```

`apps/client/src/components/TextForm.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextForm } from "./TextForm";

describe("TextForm", () => {
  it("submits trimmed text and clears the field", () => {
    const onSubmit = vi.fn();
    render(<TextForm label="Message" submitLabel="Send" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "  hello  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).toHaveBeenCalledWith("hello");
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("cannot submit blank text", () => {
    render(<TextForm label="Message" submitLabel="Send" onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("can be disabled", () => {
    render(<TextForm label="Message" submitLabel="Send" disabled onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Message")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm --filter @game/client test`
Expected: FAIL — missing `./test/setup.ts` and modules under test.

- [ ] **Step 5: Implement i18n, the network layer and test helpers**

`apps/client/src/net/session.ts`:
```ts
const KEYS = { playerId: "liveSuspects.playerId", name: "liveSuspects.name", uiLanguage: "liveSuspects.uiLanguage" };

// Storage can be unavailable (private mode, blocked site data); the game then just forgets between visits.
function read(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignored on purpose, see above.
  }
}

export const session = {
  playerId: () => read(KEYS.playerId),
  setPlayerId: (id: string) => write(KEYS.playerId, id),
  name: () => read(KEYS.name),
  setName: (name: string) => write(KEYS.name, name),
  uiLanguage: () => read(KEYS.uiLanguage),
  setUiLanguage: (language: string) => write(KEYS.uiLanguage, language),
};
```

`apps/client/src/net/roomPath.ts`:
```ts
export function roomIdFromPath(pathname: string): string | undefined {
  return /^\/room\/([a-z0-9]{6})\/?$/i.exec(pathname)?.[1]?.toUpperCase();
}

export function roomPath(roomId: string): string {
  return `/room/${roomId}`;
}

export function roomUrl(roomId: string, origin: string = window.location.origin): string {
  return `${origin}${roomPath(roomId)}`;
}
```

`apps/client/src/net/socket.ts`:
```ts
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@game/shared";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Connects to the page's own origin; in development Vite proxies /socket.io to the game server. */
export function createSocket(): GameSocket {
  return io();
}
```

`apps/client/src/net/useRoom.ts`:
```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AckResult, GameErrorCode, Language, PublicRoomView } from "@game/shared";
import { roomPath } from "./roomPath";
import { session } from "./session";
import { createSocket, type GameSocket } from "./socket";

export interface RoomActions {
  create(settings: { name: string; language: Language; suspectCount: number }): Promise<GameErrorCode | undefined>;
  join(roomId: string, name: string): Promise<GameErrorCode | undefined>;
  start(): void;
  ask(suspectId: string, text: string): void;
  chat(text: string): void;
  proposeVote(): void;
  castVote(suspectId: string): void;
  restart(): void;
}

export interface RoomSession {
  view?: PublicRoomView;
  playerId?: string;
  /** Streamed text of the answer currently being written, keyed by log entry id. */
  deltas: Record<string, string>;
  error?: GameErrorCode;
  connected: boolean;
  dismissError(): void;
  actions: RoomActions;
}

/** Streamed text matters only while an answer is pending; finished answers come from the log. */
export function keepPendingDelta(deltas: Record<string, string>, view: PublicRoomView): Record<string, string> {
  const entryId = view.pendingAnswer?.entryId;
  return entryId ? { [entryId]: deltas[entryId] ?? "" } : {};
}

interface Membership {
  roomId: string;
  name: string;
  playerId: string;
}

export function useRoom(): RoomSession {
  const socketRef = useRef<GameSocket | null>(null);
  const membershipRef = useRef<Membership | null>(null);
  const [view, setView] = useState<PublicRoomView>();
  const [playerId, setPlayerId] = useState<string>();
  const [deltas, setDeltas] = useState<Record<string, string>>({});
  const [error, setError] = useState<GameErrorCode>();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // After a dropped connection, put the player back into their room.
      const membership = membershipRef.current;
      if (!membership) return;
      socket.emit("room:join", membership, (result) => {
        if (result.ok) return;
        membershipRef.current = null;
        setView(undefined);
        setError(result.error);
        window.history.replaceState(null, "", "/");
      });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("room:state", (next) => {
      setView(next);
      setDeltas((current) => keepPendingDelta(current, next));
    });
    socket.on("answer:delta", ({ entryId, text }) =>
      setDeltas((current) => ({ ...current, [entryId]: (current[entryId] ?? "") + text })),
    );
    socket.on("game:error", ({ code }) => setError(code));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const enter = useCallback((result: AckResult, name: string): GameErrorCode | undefined => {
    if (!result.ok) {
      setError(result.error);
      return result.error;
    }
    membershipRef.current = { roomId: result.roomId, name, playerId: result.playerId };
    session.setPlayerId(result.playerId);
    session.setName(name);
    setPlayerId(result.playerId);
    window.history.replaceState(null, "", roomPath(result.roomId));
    return undefined;
  }, []);

  const actions = useMemo<RoomActions>(
    () => ({
      async create(settings) {
        const socket = socketRef.current;
        if (!socket) return "NOT_IN_ROOM";
        return enter(await socket.emitWithAck("room:create", { ...settings, playerId: session.playerId() }), settings.name);
      },
      async join(roomId, name) {
        const socket = socketRef.current;
        if (!socket) return "NOT_IN_ROOM";
        return enter(await socket.emitWithAck("room:join", { roomId, name, playerId: session.playerId() }), name);
      },
      start: () => socketRef.current?.emit("game:start"),
      ask: (suspectId, text) => socketRef.current?.emit("ask", { suspectId, text }),
      chat: (text) => socketRef.current?.emit("chat", { text }),
      proposeVote: () => socketRef.current?.emit("vote:propose"),
      castVote: (suspectId) => socketRef.current?.emit("vote:cast", { suspectId }),
      restart: () => socketRef.current?.emit("game:restart"),
    }),
    [enter],
  );

  const dismissError = useCallback(() => setError(undefined), []);

  return { view, playerId, deltas, error, connected, dismissError, actions };
}
```

`apps/client/src/i18n/index.ts`:
```ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { session } from "../net/session";
import en from "./en.json";
import ru from "./ru.json";

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: ru } },
  lng: session.uiLanguage() ?? "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // React already escapes
});
i18n.on("languageChanged", (language) => session.setUiLanguage(language));

export default i18n;
```

`apps/client/src/screens/types.ts`:
```ts
import type { PublicRoomView } from "@game/shared";
import type { RoomActions } from "../net/useRoom";

export interface ScreenProps {
  view: PublicRoomView;
  playerId: string;
  actions: RoomActions;
}
```

`apps/client/src/test/setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import i18n from "../i18n";

afterEach(async () => {
  cleanup();
  localStorage.clear();
  await i18n.changeLanguage("en");
});
```

`apps/client/src/test/fixtures.ts`:
```ts
import { vi } from "vitest";
import { toPublicCase, type Case, type PublicRoomView } from "@game/shared";
import { sampleCase } from "@game/shared/testing";
import type { RoomActions } from "../net/useRoom";

/** Three suspects; the killer is s1 "Margaret Hale". */
export const fullCase: Case = { ...sampleCase(3), id: "case1" };

/** Anna (p1, host, has the turn) and Boris (p2) investigating the sample case. */
export function makeView(overrides: Partial<PublicRoomView> = {}): PublicRoomView {
  return {
    id: "K7QF2X",
    hostId: "p1",
    language: "en",
    suspectCount: 3,
    players: [
      { id: "p1", name: "Anna", connected: true },
      { id: "p2", name: "Boris", connected: true },
    ],
    phase: "investigating",
    movesLeft: 12,
    turnPlayerId: "p1",
    log: [],
    case: toPublicCase(fullCase),
    ...overrides,
  };
}

export function makeActions() {
  return {
    create: vi.fn(async () => undefined),
    join: vi.fn(async () => undefined),
    start: vi.fn(),
    ask: vi.fn(),
    chat: vi.fn(),
    proposeVote: vi.fn(),
    castVote: vi.fn(),
    restart: vi.fn(),
  } satisfies RoomActions;
}
```

- [ ] **Step 6: Implement the shared components**

`apps/client/src/components/TextForm.tsx`:
```tsx
import { useState } from "react";
import { MAX_TEXT_LENGTH } from "@game/shared";

interface TextFormProps {
  /** Used as both the placeholder and the accessible label. */
  label: string;
  submitLabel: string;
  disabled?: boolean;
  onSubmit(text: string): void;
}

export function TextForm({ label, submitLabel, disabled = false, onSubmit }: TextFormProps) {
  const [text, setText] = useState("");
  const trimmed = text.trim();

  return (
    <form
      className="text-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed || disabled) return;
        onSubmit(trimmed);
        setText("");
      }}
    >
      <input
        aria-label={label}
        placeholder={label}
        value={text}
        maxLength={MAX_TEXT_LENGTH}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" disabled={disabled || !trimmed}>
        {submitLabel}
      </button>
    </form>
  );
}
```

`apps/client/src/components/ErrorToast.tsx`:
```tsx
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { GameErrorCode } from "@game/shared";

export function ErrorToast({ code, onDismiss }: { code?: GameErrorCode; onDismiss(): void }) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!code) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [code, onDismiss]);

  if (!code) return null;
  return (
    <button type="button" className="toast" role="alert" onClick={onDismiss}>
      {t(`errors.${code}`)}
    </button>
  );
}
```

`apps/client/src/components/LanguageSwitch.tsx`:
```tsx
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "@game/shared";

export function LanguageSwitch() {
  const { i18n } = useTranslation();
  return (
    <div className="segmented small" role="group" aria-label="Interface language">
      {LANGUAGES.map((language) => (
        <button
          key={language}
          type="button"
          aria-pressed={i18n.resolvedLanguage === language}
          onClick={() => void i18n.changeLanguage(language)}
        >
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
```

`apps/client/src/components/SuspectList.tsx`:
```tsx
import { useTranslation } from "react-i18next";
import type { PublicSuspect } from "@game/shared";

interface SuspectListProps {
  suspects: PublicSuspect[];
  selectedId?: string;
  answeringId?: string;
  /** Omit to show the cards read-only. */
  onSelect?(suspectId: string): void;
}

export function SuspectList({ suspects, selectedId, answeringId, onSelect }: SuspectListProps) {
  const { t } = useTranslation();
  return (
    <section className="suspects">
      <h2>{t("inv.suspects")}</h2>
      <ul>
        {suspects.map((suspect) => (
          <li key={suspect.id}>
            <button
              type="button"
              className={[
                "suspect-card",
                suspect.id === selectedId && "selected",
                suspect.id === answeringId && "answering",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={suspect.id === selectedId}
              disabled={!onSelect}
              onClick={() => onSelect?.(suspect.id)}
            >
              <span className="suspect-name">{suspect.name}</span>
              <span className="suspect-role">{suspect.role}</span>
              <span className="suspect-desc">{suspect.publicDescription}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm --filter @game/client test && pnpm --filter @game/client typecheck`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/client pnpm-lock.yaml
git commit -m "feat(client): add Vite app, translations, socket hook and shared components" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Client screens — Home, Lobby, Generating, Investigation

**Files:**
- Create: `apps/client/src/screens/Home.tsx`, `Lobby.tsx`, `Generating.tsx`
- Create: `apps/client/src/screens/investigation/Investigation.tsx`, `Briefing.tsx`, `CaseLog.tsx`
- Test: `apps/client/src/screens/Home.test.tsx`, `Lobby.test.tsx`, `investigation/Investigation.test.tsx`

**Interfaces:**
- Consumes: Task 12 (`ScreenProps`, `RoomActions`, `TextForm`, `SuspectList`, `session`, `roomUrl`, fixtures).
- Produces: `<Home actions initialRoomId? />`, `<Lobby {...ScreenProps} />`, `<Generating />`, `<Investigation {...ScreenProps} deltas />`.

- [ ] **Step 1: Write the failing tests**

`apps/client/src/screens/Home.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeActions } from "../test/fixtures";
import { Home } from "./Home";

describe("Home", () => {
  it("creates a room with the chosen settings", () => {
    const actions = makeActions();
    render(<Home actions={actions} />);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "  Anna " } });
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: "Create room" }));
    expect(actions.create).toHaveBeenCalledWith({ name: "Anna", language: "en", suspectCount: 5 });
  });

  it("needs a name before creating", () => {
    render(<Home actions={makeActions()} />);
    expect(screen.getByRole("button", { name: "Create room" })).toBeDisabled();
  });

  it("joins with a normalized 6-character code", () => {
    const actions = makeActions();
    render(<Home actions={actions} />);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Boris" } });
    const join = screen.getByRole("button", { name: "Join" });
    expect(join).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Room code"), { target: { value: " k7qf2x " } });
    fireEvent.click(join);
    expect(actions.join).toHaveBeenCalledWith("K7QF2X", "Boris");
  });

  it("prefills the code from an invite link", () => {
    render(<Home actions={makeActions()} initialRoomId="K7QF2X" />);
    expect(screen.getByLabelText("Room code")).toHaveValue("K7QF2X");
  });
});
```

`apps/client/src/screens/Lobby.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeActions, makeView } from "../test/fixtures";
import { Lobby } from "./Lobby";

const lobbyView = makeView({ phase: "lobby", case: undefined, movesLeft: 0, turnPlayerId: undefined });

describe("Lobby", () => {
  it("shows the code, the players and lets the host start", () => {
    const actions = makeActions();
    render(<Lobby view={lobbyView} playerId="p1" actions={actions} />);
    expect(screen.getByText("K7QF2X")).toBeInTheDocument();
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("Boris")).toBeInTheDocument();
    expect(screen.getByText(/shares 12 questions/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start the investigation" }));
    expect(actions.start).toHaveBeenCalled();
  });

  it("makes guests wait for the host", () => {
    render(<Lobby view={lobbyView} playerId="p2" actions={makeActions()} />);
    expect(screen.queryByRole("button", { name: "Start the investigation" })).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for the host to start…")).toBeInTheDocument();
  });
});
```

`apps/client/src/screens/investigation/Investigation.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeActions, makeView } from "../../test/fixtures";
import { Investigation } from "./Investigation";

describe("Investigation", () => {
  it("lets the active player pick a suspect and ask", () => {
    const actions = makeActions();
    render(<Investigation view={makeView()} playerId="p1" actions={actions} deltas={{}} />);
    expect(screen.getByLabelText("Choose a suspect first")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Margaret Hale/ }));
    fireEvent.change(screen.getByLabelText("Ask Margaret Hale…"), { target: { value: "Where were you?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(actions.ask).toHaveBeenCalledWith("s1", "Where were you?");
  });

  it("tells other players whose turn it is", () => {
    render(<Investigation view={makeView()} playerId="p2" actions={makeActions()} deltas={{}} />);
    expect(screen.getByText("Waiting for Anna to ask…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask" })).not.toBeInTheDocument();
  });

  it("shows the moves left and lets anyone call a vote", () => {
    const actions = makeActions();
    render(<Investigation view={makeView({ movesLeft: 7 })} playerId="p2" actions={actions} deltas={{}} />);
    expect(screen.getByText("Questions left: 7")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Call a vote" }));
    expect(actions.proposeVote).toHaveBeenCalled();
  });

  it("streams the pending answer and blocks votes meanwhile", () => {
    const view = makeView({
      log: [
        { kind: "question", id: "q1", ts: 1, playerId: "p1", suspectId: "s2", text: "Where?" },
        { kind: "answer", id: "a1", ts: 1, suspectId: "s2", text: "" },
      ],
      pendingAnswer: { suspectId: "s2", entryId: "a1" },
    });
    render(<Investigation view={view} playerId="p2" actions={makeActions()} deltas={{ a1: "In the drawing" }} />);
    expect(screen.getByText("Anna → Dr. Arthur Finch")).toBeInTheDocument();
    expect(screen.getByText(/In the drawing/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Call a vote" })).toBeDisabled();
  });

  it("translates system messages and shows chat", () => {
    const view = makeView({
      log: [
        { kind: "chat", id: "c1", ts: 1, playerId: "p2", text: "It's the wife!" },
        { kind: "system", id: "s1", ts: 2, code: "VOTE_TIED" },
      ],
    });
    render(<Investigation view={view} playerId="p1" actions={makeActions()} deltas={{}} />);
    expect(screen.getByText("It's the wife!")).toBeInTheDocument();
    expect(screen.getByText("The vote is tied. The investigation continues.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @game/client test`
Expected: FAIL — cannot resolve `./Home`, `./Lobby`, `./Investigation`.

- [ ] **Step 3: Implement Home, Lobby and Generating**

`apps/client/src/screens/Home.tsx`:
```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, MAX_SUSPECTS, MIN_SUSPECTS, type Language } from "@game/shared";
import { session } from "../net/session";
import type { RoomActions } from "../net/useRoom";

const SUSPECT_COUNTS = Array.from({ length: MAX_SUSPECTS - MIN_SUSPECTS + 1 }, (_, i) => MIN_SUSPECTS + i);

interface HomeProps {
  actions: Pick<RoomActions, "create" | "join">;
  initialRoomId?: string;
}

export function Home({ actions, initialRoomId }: HomeProps) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState(session.name() ?? "");
  const [language, setLanguage] = useState<Language>(i18n.resolvedLanguage === "ru" ? "ru" : "en");
  const [suspectCount, setSuspectCount] = useState(4);
  const [code, setCode] = useState(initialRoomId ?? "");
  const [busy, setBusy] = useState(false);

  const trimmedName = name.trim();
  const roomCode = code.trim().toUpperCase();

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  const chooseLanguage = (next: Language) => {
    setLanguage(next);
    void i18n.changeLanguage(next);
  };

  return (
    <main className="home">
      <header className="home-header">
        <h1 className="title">{t("app.title")}</h1>
        <p className="tagline">{t("app.tagline")}</p>
      </header>

      <label className="field">
        <span>{t("home.name")}</span>
        <input value={name} maxLength={24} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
      </label>

      <div className="home-cards">
        <section className="card">
          <h2>{t("home.newCase")}</h2>
          <div className="field">
            <span>{t("home.language")}</span>
            <div className="segmented" role="group" aria-label={t("home.language")}>
              {LANGUAGES.map((option) => (
                <button key={option} type="button" aria-pressed={language === option} onClick={() => chooseLanguage(option)}>
                  {t(`lang.${option}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>{t("home.suspects")}</span>
            <div className="segmented" role="group" aria-label={t("home.suspects")}>
              {SUSPECT_COUNTS.map((count) => (
                <button key={count} type="button" aria-pressed={suspectCount === count} onClick={() => setSuspectCount(count)}>
                  {count}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="primary"
            disabled={!trimmedName || busy}
            onClick={() => run(() => actions.create({ name: trimmedName, language, suspectCount }))}
          >
            {t("home.create")}
          </button>
        </section>

        <section className="card">
          <h2>{t("home.joinTitle")}</h2>
          <input
            className="code-input"
            aria-label={t("home.joinCode")}
            placeholder={t("home.joinCode")}
            value={code}
            maxLength={8}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            type="button"
            disabled={!trimmedName || roomCode.length !== 6 || busy}
            onClick={() => run(() => actions.join(roomCode, trimmedName))}
          >
            {t("home.join")}
          </button>
        </section>
      </div>
    </main>
  );
}
```

`apps/client/src/screens/Lobby.tsx`:
```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { movesForSuspectCount } from "@game/shared";
import { roomUrl } from "../net/roomPath";
import type { ScreenProps } from "./types";

export function Lobby({ view, playerId, actions }: ScreenProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const isHost = view.hostId === playerId;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl(view.id));
      setCopied(true);
    } catch {
      // Clipboard can be blocked (e.g. plain http on a LAN); the code is on screen to share by hand.
    }
  };

  return (
    <main className="lobby">
      <h1 className="title">{t("lobby.title")}</h1>

      <section className="card room-code">
        <span className="label">{t("lobby.code")}</span>
        <strong className="code">{view.id}</strong>
        <button type="button" onClick={copyLink}>
          {copied ? t("lobby.copied") : t("lobby.copyLink")}
        </button>
      </section>

      <section className="card">
        <h2>{t("lobby.players")}</h2>
        <ul className="players">
          {view.players.map((player) => (
            <li key={player.id} className={player.connected ? undefined : "offline"}>
              <span>{player.name}</span>
              {player.id === view.hostId && <span className="tag">{t("lobby.host")}</span>}
              {player.id === playerId && <span className="tag">{t("lobby.you")}</span>}
              {!player.connected && <span className="tag">{t("lobby.offline")}</span>}
            </li>
          ))}
        </ul>
      </section>

      <p className="rules">{t("lobby.rules", { moves: movesForSuspectCount(view.suspectCount) })}</p>

      {isHost ? (
        <button type="button" className="primary" onClick={() => actions.start()}>
          {t("lobby.start")}
        </button>
      ) : (
        <p className="hint">{t("lobby.waitingHost")}</p>
      )}
    </main>
  );
}
```

`apps/client/src/screens/Generating.tsx`:
```tsx
import { useTranslation } from "react-i18next";

export function Generating() {
  const { t } = useTranslation();
  return (
    <main className="generating">
      <div className="spinner" aria-hidden="true" />
      <h1 className="title">{t("generating.title")}</h1>
      <p className="hint">{t("generating.hint")}</p>
    </main>
  );
}
```

- [ ] **Step 4: Implement the investigation screen**

`apps/client/src/screens/investigation/Briefing.tsx`:
```tsx
import { useTranslation } from "react-i18next";
import type { Briefing as BriefingData } from "@game/shared";

export function Briefing({ title, briefing }: { title: string; briefing: BriefingData }) {
  const { t } = useTranslation();
  const rows: Array<[string, string]> = [
    [t("inv.victim"), briefing.victim],
    [t("inv.location"), briefing.location],
    [t("inv.time"), briefing.timeOfDeath],
    [t("inv.cause"), briefing.causeOfDeath],
  ];
  return (
    <section className="card briefing">
      <h2>{title}</h2>
      <p className="setting">{briefing.setting}</p>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
```

`apps/client/src/screens/investigation/CaseLog.tsx`:
```tsx
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { LogEntry, PublicRoomView } from "@game/shared";

interface CaseLogProps {
  view: PublicRoomView;
  deltas: Record<string, string>;
}

export function CaseLog({ view, deltas }: CaseLogProps) {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);
  const playerName = new Map(view.players.map((p) => [p.id, p.name]));
  const suspectName = new Map(view.case?.suspects.map((s) => [s.id, s.name]) ?? []);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [view.log.length, deltas]);

  const render = (entry: LogEntry) => {
    switch (entry.kind) {
      case "question":
        return (
          <>
            <span className="who">
              {t("inv.asks", { player: playerName.get(entry.playerId), suspect: suspectName.get(entry.suspectId) })}
            </span>
            <p>{entry.text}</p>
          </>
        );
      case "answer": {
        const streaming = view.pendingAnswer?.entryId === entry.id;
        const text = streaming ? (deltas[entry.id] ?? "") : entry.text;
        const name = suspectName.get(entry.suspectId);
        return (
          <>
            <span className="who suspect">{name}</span>
            <p>
              {text || (streaming ? t("inv.answering", { name }) : "")}
              {streaming && <span className="cursor" aria-hidden="true" />}
            </p>
          </>
        );
      }
      case "chat":
        return (
          <>
            <span className="who">{playerName.get(entry.playerId)}</span>
            <p>{entry.text}</p>
          </>
        );
      case "system":
        return <p>{t(`system.${entry.code}`)}</p>;
    }
  };

  return (
    <div className="log" aria-live="polite">
      {view.log.map((entry) => (
        <div key={entry.id} className={`log-entry log-${entry.kind}`}>
          {render(entry)}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
```

`apps/client/src/screens/investigation/Investigation.tsx`:
```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SuspectList } from "../../components/SuspectList";
import { TextForm } from "../../components/TextForm";
import type { ScreenProps } from "../types";
import { Briefing } from "./Briefing";
import { CaseLog } from "./CaseLog";

export function Investigation({ view, playerId, actions, deltas }: ScreenProps & { deltas: Record<string, string> }) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string>();
  const publicCase = view.case;
  if (!publicCase) return null;

  const myTurn = view.turnPlayerId === playerId;
  const answering = view.pendingAnswer !== undefined;
  const selected = publicCase.suspects.find((s) => s.id === selectedId);
  const turnPlayer = view.players.find((p) => p.id === view.turnPlayerId);

  return (
    <main className="investigation">
      <aside className="dossier">
        <Briefing title={publicCase.title} briefing={publicCase.briefing} />
        <SuspectList
          suspects={publicCase.suspects}
          selectedId={myTurn ? selectedId : undefined}
          answeringId={view.pendingAnswer?.suspectId}
          onSelect={myTurn ? setSelectedId : undefined}
        />
      </aside>

      <section className="board">
        <header className="board-header">
          <span className="moves">{t("inv.moves", { count: view.movesLeft })}</span>
          <button type="button" className="accuse" disabled={answering} onClick={() => actions.proposeVote()}>
            {t("inv.accuse")}
          </button>
        </header>

        <CaseLog view={view} deltas={deltas} />

        <div className="turn">
          {myTurn ? (
            <>
              <p className="turn-hint">{t("inv.yourTurn")}</p>
              <TextForm
                label={selected ? t("inv.askPlaceholder", { name: selected.name }) : t("inv.chooseSuspect")}
                submitLabel={t("inv.ask")}
                disabled={!selected || answering}
                onSubmit={(text) => selected && actions.ask(selected.id, text)}
              />
            </>
          ) : (
            <p className="turn-hint">{t("inv.waitingFor", { name: turnPlayer?.name ?? "…" })}</p>
          )}
        </div>

        <TextForm label={t("inv.chatPlaceholder")} submitLabel={t("inv.send")} onSubmit={actions.chat} />
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @game/client test && pnpm --filter @game/client typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/screens
git commit -m "feat(client): add home, lobby, generating and investigation screens" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Vote and Reveal screens, App shell and noir styling

**Files:**
- Create: `apps/client/src/screens/Vote.tsx`, `Reveal.tsx`, `apps/client/src/App.tsx`, `apps/client/src/main.tsx`, `apps/client/src/styles.css`
- Test: `apps/client/src/screens/Vote.test.tsx`, `Reveal.test.tsx`

**Interfaces:**
- Consumes: Tasks 12–13.
- Produces: the runnable client. `App` picks the screen from `view.phase`, shows `Home` until the player is in a room, auto-rejoins `/room/CODE` when a name is remembered, and follows the room language for the UI.

- [ ] **Step 1: Write the failing tests**

`apps/client/src/screens/Vote.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeActions, makeView } from "../test/fixtures";
import { Vote } from "./Vote";

describe("Vote", () => {
  it("casts a ballot for the chosen suspect", () => {
    const actions = makeActions();
    render(<Vote view={makeView({ phase: "voting", vote: { ballots: {}, forced: false } })} playerId="p1" actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: /Margaret Hale/ }));
    expect(actions.castVote).toHaveBeenCalledWith("s1");
  });

  it("shows who has voted and marks my ballot", () => {
    const view = makeView({ phase: "voting", vote: { ballots: { p1: "s2" }, forced: false } });
    render(<Vote view={view} playerId="p1" actions={makeActions()} />);
    expect(screen.getByRole("button", { name: /Dr. Arthur Finch/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("voted")).toBeInTheDocument();
    expect(screen.getByText("thinking…")).toBeInTheDocument();
  });

  it("explains a forced vote", () => {
    render(<Vote view={makeView({ phase: "voting", vote: { ballots: {}, forced: true } })} playerId="p1" actions={makeActions()} />);
    expect(screen.getByText("You are out of questions. You must decide now.")).toBeInTheDocument();
  });
});
```

`apps/client/src/screens/Reveal.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fullCase, makeActions, makeView } from "../test/fixtures";
import { Reveal } from "./Reveal";

const revealed = (correct: boolean, accusedId: string) =>
  makeView({ phase: "revealed", result: { accusedId, correct }, reveal: fullCase });

describe("Reveal", () => {
  it("celebrates a correct accusation and explains the solution", () => {
    render(<Reveal view={revealed(true, "s1")} playerId="p1" actions={makeActions()} />);
    expect(screen.getByText("Case closed! You caught the killer.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The killer: Margaret Hale" })).toBeInTheDocument();
    expect(screen.getByText(fullCase.solution.motive)).toBeInTheDocument();
    for (const suspect of fullCase.suspects) expect(screen.getByText(suspect.secret)).toBeInTheDocument();
  });

  it("names the wrongly accused suspect", () => {
    render(<Reveal view={revealed(false, "s2")} playerId="p1" actions={makeActions()} />);
    expect(screen.getByText("Wrong suspect. The killer walks free.")).toBeInTheDocument();
    expect(screen.getByText("You accused Dr. Arthur Finch.")).toBeInTheDocument();
  });

  it("lets only the host start a new case", () => {
    const actions = makeActions();
    const { unmount } = render(<Reveal view={revealed(true, "s1")} playerId="p1" actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "New case" }));
    expect(actions.restart).toHaveBeenCalled();
    unmount();

    render(<Reveal view={revealed(true, "s1")} playerId="p2" actions={makeActions()} />);
    expect(screen.queryByRole("button", { name: "New case" })).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for the host to start a new case…")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @game/client test`
Expected: FAIL — cannot resolve `./Vote`, `./Reveal`.

- [ ] **Step 3: Implement Vote and Reveal**

`apps/client/src/screens/Vote.tsx`:
```tsx
import { useTranslation } from "react-i18next";
import { SuspectList } from "../components/SuspectList";
import type { ScreenProps } from "./types";

export function Vote({ view, playerId, actions }: ScreenProps) {
  const { t } = useTranslation();
  const ballots = view.vote?.ballots ?? {};

  return (
    <main className="vote">
      <h1 className="title">{t("vote.title")}</h1>
      <p className="hint">{view.vote?.forced ? t("vote.forced") : t("vote.hint")}</p>
      <SuspectList suspects={view.case?.suspects ?? []} selectedId={ballots[playerId]} onSelect={actions.castVote} />
      <ul className="players">
        {view.players
          .filter((player) => player.connected)
          .map((player) => (
            <li key={player.id}>
              <span>{player.name}</span>
              <span className="tag">{ballots[player.id] ? t("vote.voted") : t("vote.waiting")}</span>
            </li>
          ))}
      </ul>
    </main>
  );
}
```

`apps/client/src/screens/Reveal.tsx`:
```tsx
import { useTranslation } from "react-i18next";
import type { ScreenProps } from "./types";

export function Reveal({ view, playerId, actions }: ScreenProps) {
  const { t } = useTranslation();
  const full = view.reveal;
  const result = view.result;
  if (!full || !result) return null;

  const nameOf = (suspectId: string) => full.suspects.find((s) => s.id === suspectId)?.name ?? suspectId;

  return (
    <main className="reveal">
      <h1 className={`title verdict ${result.correct ? "correct" : "wrong"}`}>
        {result.correct ? t("reveal.correct") : t("reveal.wrong")}
      </h1>
      <p className="hint">{t("reveal.accused", { name: nameOf(result.accusedId) })}</p>

      <section className="card solution">
        <h2>{t("reveal.killer", { name: nameOf(full.solution.killerId) })}</h2>
        <dl>
          <div>
            <dt>{t("reveal.method")}</dt>
            <dd>{full.solution.method}</dd>
          </div>
          <div>
            <dt>{t("reveal.motive")}</dt>
            <dd>{full.solution.motive}</dd>
          </div>
        </dl>
        <h3>{t("reveal.evidence")}</h3>
        <ul>
          {full.solution.keyEvidence.map((evidence) => (
            <li key={evidence}>{evidence}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>{t("reveal.secrets")}</h2>
        <ul className="secrets">
          {full.suspects.map((suspect) => (
            <li key={suspect.id}>
              <strong>{suspect.name}</strong> — {suspect.role}
              <p>
                <em>{t("reveal.secret")}:</em> <span>{suspect.secret}</span>
              </p>
              <p>
                <em>{t("reveal.truth")}:</em> <span>{suspect.alibi.truth}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      {view.hostId === playerId ? (
        <button type="button" className="primary" onClick={() => actions.restart()}>
          {t("reveal.newCase")}
        </button>
      ) : (
        <p className="hint">{t("reveal.waitingHost")}</p>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @game/client test`
Expected: PASS.

- [ ] **Step 5: Implement the App shell and entry point**

`apps/client/src/App.tsx`:
```tsx
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ErrorToast } from "./components/ErrorToast";
import { LanguageSwitch } from "./components/LanguageSwitch";
import { roomIdFromPath } from "./net/roomPath";
import { session } from "./net/session";
import { useRoom } from "./net/useRoom";
import { Generating } from "./screens/Generating";
import { Home } from "./screens/Home";
import { Investigation } from "./screens/investigation/Investigation";
import { Lobby } from "./screens/Lobby";
import { Reveal } from "./screens/Reveal";
import type { ScreenProps } from "./screens/types";
import { Vote } from "./screens/Vote";

export function App() {
  const { t, i18n } = useTranslation();
  const { view, playerId, deltas, error, connected, dismissError, actions } = useRoom();
  const invitedRoomId = useMemo(() => roomIdFromPath(window.location.pathname), []);
  const triedAutoJoin = useRef(false);

  // Reopening /room/CODE (reload, or the invite link again) with a remembered name rejoins silently.
  useEffect(() => {
    const name = session.name();
    if (!connected || view || !invitedRoomId || !name || triedAutoJoin.current) return;
    triedAutoJoin.current = true;
    void actions.join(invitedRoomId, name).then((joinError) => {
      if (joinError === "ROOM_NOT_FOUND") window.history.replaceState(null, "", "/");
    });
  }, [connected, view, invitedRoomId, actions]);

  // The UI follows the room's language when it changes; players can still switch it by hand.
  useEffect(() => {
    if (view?.language) void i18n.changeLanguage(view.language);
  }, [view?.language, i18n]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">{t("app.title")}</span>
        <LanguageSwitch />
      </header>

      {view && playerId ? (
        <Screen view={view} playerId={playerId} actions={actions} deltas={deltas} />
      ) : (
        <Home actions={actions} initialRoomId={invitedRoomId} />
      )}

      {view && !connected && (
        <div className="banner" role="status">
          {t("errors.CONNECTION")}
        </div>
      )}
      <ErrorToast code={error} onDismiss={dismissError} />
    </div>
  );
}

function Screen({ deltas, ...props }: ScreenProps & { deltas: Record<string, string> }) {
  switch (props.view.phase) {
    case "lobby":
      return <Lobby {...props} />;
    case "generating":
      return <Generating />;
    case "investigating":
      return <Investigation {...props} deltas={deltas} />;
    case "voting":
      return <Vote {...props} />;
    case "revealed":
      return <Reveal {...props} />;
  }
}
```

`apps/client/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./i18n";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Add the noir stylesheet**

`apps/client/src/styles.css`:
```css
:root {
  --bg: #0f0e0c;
  --panel: #1a1815;
  --panel-raised: #24211c;
  --paper: #e9e1cc;
  --muted: #a39a85;
  --line: #3a352c;
  --accent: #b3261e;
  --accent-soft: #d4554c;
  --good: #6f9a62;
  --font-display: "Playfair Display", Georgia, serif;
  --font-body: "PT Serif", Georgia, serif;
  --font-mono: "PT Mono", ui-monospace, monospace;
  color-scheme: dark;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background: radial-gradient(ellipse at top, #1f1c17 0%, var(--bg) 60%) fixed;
  color: var(--paper);
  font-family: var(--font-body);
  font-size: 17px;
  line-height: 1.5;
}

button, input { font: inherit; color: inherit; }

button {
  cursor: pointer;
  border: 1px solid var(--line);
  background: var(--panel-raised);
  padding: 0.55rem 1rem;
  border-radius: 4px;
  transition: border-color 0.15s, background 0.15s;
}
button:hover:not(:disabled) { border-color: var(--muted); }
button:disabled { opacity: 0.45; cursor: not-allowed; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent-soft); outline-offset: 2px; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 700; }
button.primary:hover:not(:disabled) { background: var(--accent-soft); }

input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0.55rem 0.75rem;
}

h1, h2, h3 { font-family: var(--font-display); font-weight: 600; margin: 0 0 0.5rem; }
h2 { font-size: 1.15rem; letter-spacing: 0.02em; }

.app { max-width: 1200px; margin: 0 auto; padding: 0 16px 48px; }

.topbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 0; border-bottom: 1px solid var(--line); margin-bottom: 24px;
}
.brand { font-family: var(--font-display); font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-soft); }

.title { font-size: clamp(1.8rem, 4vw, 2.8rem); font-weight: 800; }
.tagline, .hint, .rules { color: var(--muted); }

.card { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 18px; }

.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.field > span { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }

.segmented { display: inline-flex; flex-wrap: wrap; gap: 0; }
.segmented button { border-radius: 0; margin-left: -1px; }
.segmented button:first-child { border-radius: 4px 0 0 4px; margin-left: 0; }
.segmented button:last-child { border-radius: 0 4px 4px 0; }
.segmented button[aria-pressed="true"] { background: var(--paper); color: var(--bg); border-color: var(--paper); }
.segmented.small button { padding: 0.2rem 0.6rem; font-size: 0.8rem; }

.tag {
  margin-left: 8px; padding: 1px 8px; border: 1px solid var(--line); border-radius: 999px;
  font-size: 0.75rem; color: var(--muted); font-family: var(--font-mono);
}

/* Home */
.home { display: flex; flex-direction: column; gap: 16px; max-width: 760px; margin: 0 auto; }
.home-header { text-align: center; margin: 24px 0; }
.home-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.home-cards .card { display: flex; flex-direction: column; gap: 12px; }
.code-input { font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.3em; }

/* Lobby */
.lobby { display: flex; flex-direction: column; gap: 16px; max-width: 640px; margin: 0 auto; }
.room-code { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.room-code .label { color: var(--muted); }
.room-code .code { font-family: var(--font-mono); font-size: 2rem; letter-spacing: 0.25em; color: var(--accent-soft); }
.players { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.players li.offline { opacity: 0.5; }

/* Generating */
.generating { text-align: center; padding: 80px 0; }
.spinner {
  width: 48px; height: 48px; margin: 0 auto 24px; border-radius: 50%;
  border: 3px solid var(--line); border-top-color: var(--accent); animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Investigation */
.investigation { display: grid; grid-template-columns: minmax(280px, 360px) 1fr; gap: 20px; align-items: start; }
@media (max-width: 860px) { .investigation { grid-template-columns: 1fr; } }
.dossier { display: flex; flex-direction: column; gap: 16px; }
.briefing .setting { font-style: italic; color: var(--muted); }
.briefing dl { margin: 0; display: grid; gap: 6px; }
.briefing dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.briefing dd { margin: 0; }

.suspects ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.suspect-card {
  width: 100%; text-align: left; display: flex; flex-direction: column; gap: 2px;
  background: var(--panel); padding: 12px 14px;
}
.suspect-card:disabled { opacity: 1; cursor: default; }
.suspect-card.selected { border-color: var(--accent); box-shadow: inset 3px 0 0 var(--accent); }
.suspect-card.answering { border-color: var(--paper); }
.suspect-name { font-family: var(--font-display); font-size: 1.05rem; }
.suspect-role { font-size: 0.85rem; color: var(--accent-soft); }
.suspect-desc { font-size: 0.85rem; color: var(--muted); }

.board { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.board-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.moves { font-family: var(--font-mono); color: var(--muted); }
.accuse { border-color: var(--accent); color: var(--accent-soft); }

.log {
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px;
  padding: 16px; height: min(55vh, 560px); overflow-y: auto; display: flex; flex-direction: column; gap: 12px;
}
.log-entry p { margin: 2px 0 0; overflow-wrap: anywhere; }
.log-entry .who { font-size: 0.8rem; font-family: var(--font-mono); color: var(--muted); }
.log-question p { color: var(--paper); }
.log-answer { padding-left: 14px; border-left: 2px solid var(--accent); }
.log-answer .who.suspect { color: var(--accent-soft); }
.log-answer p { font-style: italic; }
.log-chat { opacity: 0.8; }
.log-chat p { font-size: 0.92rem; }
.log-system { text-align: center; color: var(--muted); font-size: 0.9rem; }
.cursor {
  display: inline-block; width: 0.5em; height: 1em; margin-left: 2px; vertical-align: text-bottom;
  background: var(--paper); animation: blink 1s steps(2) infinite;
}
@keyframes blink { 50% { opacity: 0; } }

.turn-hint { margin: 0 0 6px; color: var(--muted); }
.text-form { display: flex; gap: 8px; }
.text-form input { flex: 1; min-width: 0; }

/* Vote */
.vote { display: flex; flex-direction: column; gap: 16px; max-width: 640px; margin: 0 auto; }

/* Reveal */
.reveal { display: flex; flex-direction: column; gap: 16px; max-width: 760px; margin: 0 auto; }
.verdict.correct { color: var(--good); }
.verdict.wrong { color: var(--accent-soft); }
.solution dl { display: grid; gap: 8px; margin: 0 0 12px; }
.solution dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.solution dd { margin: 0; }
.secrets { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 14px; }
.secrets p { margin: 4px 0 0; color: var(--muted); }

/* Feedback */
.toast {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  max-width: calc(100% - 32px); background: var(--accent); border-color: var(--accent); color: #fff;
}
.banner {
  position: fixed; top: 0; left: 0; right: 0; padding: 8px 16px; text-align: center;
  background: var(--panel-raised); border-bottom: 1px solid var(--accent); color: var(--paper);
}

@media (prefers-reduced-motion: reduce) {
  .spinner, .cursor { animation: none; }
}
```

- [ ] **Step 7: Run all client checks and build**

Run: `pnpm --filter @game/client test && pnpm --filter @game/client typecheck && pnpm --filter @game/client build`
Expected: tests PASS, no type errors, Vite build succeeds into `apps/client/dist`.

- [ ] **Step 8: Commit**

```bash
git add apps/client
git commit -m "feat(client): add vote and reveal screens, app shell and noir styling" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Full verification and play-through

**Files:**
- Modify only if a check fails (fix in the file the failure points to, with a regression test where it is testable).

**Interfaces:**
- Consumes: the whole app.
- Produces: evidence that the game works end to end, reported to the user.

- [ ] **Step 1: Run every automated check from the root**

Run: `pnpm test && pnpm typecheck`
Expected: all shared, server and client tests PASS; no type errors in any package.

- [ ] **Step 2: Play a full game in fake mode with two players**

Run `LLM_MODE=fake pnpm dev` (set `LLM_MODE=fake` in `apps/server/.env` or the shell). Open http://localhost:5173 in two separate browser profiles or one normal and one private window.

Check, in order:
1. Window A: enter a name, pick Русский and 3 suspects, create the room. The UI switches to Russian; the lobby shows the code and the invite link copies.
2. Window B: open the invite link, enter a name, join. Both windows list both players; only A sees the start button.
3. A starts. Both see "Preparing the case…" for ~1.5s, then the investigation with the briefing and 3 suspects. The counter shows 12.
4. A picks a suspect and asks. Both windows see the answer stream in word by word; the counter drops to 11 and it is B's turn. B cannot ask before that.
5. Reload window B mid-game. B is back in the room, still a connected player, and the log is intact.
6. Chat from either window appears in both logs without changing the counter.
7. B calls a vote, both vote for different suspects: the tie message appears and the investigation continues. Vote again for the same suspect: the reveal shows the verdict, the killer, method, motive and all secrets. A sees "New case", B sees the waiting text. A starts a new case; both return to the lobby.

Expected: every check passes. Fix anything that does not before moving on.

- [ ] **Step 3: Play one real game with Claude (ask the user first: this spends API credits)**

Remove `LLM_MODE=fake`, keep `ANTHROPIC_API_KEY` in `apps/server/.env`, restart `pnpm dev`, and play one English game with 3 suspects: ask each suspect at least one question, then accuse.

Expected: the case appears within about a minute; answers stream in character, in English, 2–5 sentences; nobody admits to being an AI; the reveal matches what the suspects hinted at. Report the generation time, anything that broke character, and whether the case felt solvable. Treat prompt quality issues as findings for the user rather than tuning prompts unasked.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found in the end-to-end play-through" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Skip if nothing changed.)
