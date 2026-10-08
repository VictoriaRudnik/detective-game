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
