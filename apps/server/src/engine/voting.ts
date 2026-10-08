import type { GameErrorCode, RoomState } from "@game/shared";
import type { ActionOf } from "./actions";
import { appendSystem, findPlayer, isConnected, nextConnectedPlayerId } from "./state";
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
    // The turn holder may have left during the vote; disconnect only moves the turn while investigating.
    if (!isConnected(s, s.turnPlayerId)) s.turnPlayerId = nextConnectedPlayerId(s, s.turnPlayerId);
    appendSystem(s, "VOTE_TIED", ctx);
    return;
  }
  const accusedId = leaders[Math.floor(ctx.random() * leaders.length)]!;
  s.phase = "revealed";
  s.result = { accusedId, correct: accusedId === s.case.solution.killerId };
}
