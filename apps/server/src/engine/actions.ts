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
