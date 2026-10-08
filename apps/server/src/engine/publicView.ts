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
