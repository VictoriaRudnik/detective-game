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
  // While their question is being answered the turn stays put; answerDone/answerFailed move it on.
  if (s.phase === "investigating" && s.turnPlayerId === player.id && !s.pendingAnswer) {
    s.turnPlayerId = nextConnectedPlayerId(s, player.id);
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
