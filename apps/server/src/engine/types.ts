import type { GameErrorCode, RoomState } from "@game/shared";

/** Everything non-deterministic the engine needs, injected so the engine stays pure. */
export interface EngineCtx {
  now(): number;
  newId(): string;
  /** Returns a number in [0, 1). */
  random(): number;
}

export type ReducerResult = { ok: true; state: RoomState } | { ok: false; error: GameErrorCode };
