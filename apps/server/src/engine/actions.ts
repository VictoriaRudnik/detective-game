import type { Case } from "@game/shared";

export type Action =
  | { type: "join"; playerId: string; name: string }
  | { type: "disconnect"; playerId: string }
  | { type: "start"; playerId: string }
  | { type: "caseReady"; case: Case }
  | { type: "caseFailed" }
  | { type: "restart"; playerId: string };

export type ActionOf<T extends Action["type"]> = Extract<Action, { type: T }>;
