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
