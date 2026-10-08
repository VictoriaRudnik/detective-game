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
