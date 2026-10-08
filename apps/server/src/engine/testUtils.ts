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
