import { describe, expect, it } from "vitest";
import type { RoomState } from "@game/shared";
import { reduce } from "./reducer";
import { apply, errorOf, investigating, lobby, testCtx } from "./testUtils";

const propose = (playerId = "p1") => ({ type: "proposeVote", playerId }) as const;
const cast = (playerId: string, suspectId: string) => ({ type: "castVote", playerId, suspectId }) as const;
const voting = (players = ["p1", "p2"]) => apply(investigating(players), propose());

describe("proposeVote", () => {
  it("opens a regular vote", () => {
    const s = voting();
    expect(s.phase).toBe("voting");
    expect(s.vote).toEqual({ initiatorId: "p1", ballots: {}, forced: false });
    expect(s.log.at(-1)).toMatchObject({ kind: "system", code: "VOTE_STARTED" });
  });

  it("is rejected outside the investigation and while a suspect is answering", () => {
    expect(errorOf(lobby(), propose())).toBe("WRONG_PHASE");
    const answering = apply(investigating(), { type: "ask", playerId: "p1", suspectId: "s1", text: "Hi" });
    expect(errorOf(answering, propose("p2"))).toBe("ANSWER_IN_PROGRESS");
  });
});

describe("castVote", () => {
  it("waits until every connected player has voted", () => {
    const s = apply(voting(), cast("p1", "s1"));
    expect(s.phase).toBe("voting");
    expect(s.vote?.ballots).toEqual({ p1: "s1" });
  });

  it("reveals a correct accusation", () => {
    const s = apply(voting(), cast("p1", "s1"), cast("p2", "s1"));
    expect(s.phase).toBe("revealed");
    expect(s.result).toEqual({ accusedId: "s1", correct: true });
  });

  it("reveals a wrong accusation", () => {
    const s = apply(voting(["p1", "p2", "p3"]), cast("p1", "s2"), cast("p2", "s2"), cast("p3", "s1"));
    expect(s.result).toEqual({ accusedId: "s2", correct: false });
  });

  it("lets a player change their ballot before the vote closes", () => {
    const s = apply(voting(), cast("p1", "s2"), cast("p1", "s1"), cast("p2", "s1"));
    expect(s.result?.accusedId).toBe("s1");
  });

  it("returns to the investigation on a regular tie", () => {
    const s = apply(voting(), cast("p1", "s1"), cast("p2", "s2"));
    expect(s.phase).toBe("investigating");
    expect(s.vote).toBeUndefined();
    expect(s.log.at(-1)).toMatchObject({ kind: "system", code: "VOTE_TIED" });
  });

  it("resolves a regular tie randomly when no questions are left", () => {
    const noMoves: RoomState = { ...investigating(), movesLeft: 0 };
    const s = apply(noMoves, propose(), cast("p1", "s1"), cast("p2", "s2"));
    expect(s.phase).toBe("revealed");
    expect(s.result?.accusedId).toBe("s1");
  });

  it("does not wait for disconnected players", () => {
    const s = apply(voting(), cast("p1", "s1"), { type: "disconnect", playerId: "p2" });
    expect(s.phase).toBe("revealed");
  });

  it("rejects unknown suspects, unknown players and votes outside the voting phase", () => {
    expect(errorOf(voting(), cast("p1", "s9"))).toBe("UNKNOWN_SUSPECT");
    expect(errorOf(voting(), cast("zz", "s1"))).toBe("UNKNOWN_PLAYER");
    expect(errorOf(investigating(), cast("p1", "s1"))).toBe("WRONG_PHASE");
  });
});

describe("forced vote", () => {
  const lastQuestion = () =>
    apply(
      { ...investigating(), movesLeft: 1 },
      { type: "ask", playerId: "p1", suspectId: "s2", text: "Last one" },
      { type: "answerDone", text: "Fine." },
    );

  it("starts when the last move is spent", () => {
    const s = lastQuestion();
    expect(s.phase).toBe("voting");
    expect(s.vote).toEqual({ initiatorId: undefined, ballots: {}, forced: true });
    expect(s.log.at(-1)).toMatchObject({ kind: "system", code: "FORCED_VOTE" });
  });

  it("breaks ties randomly among the leaders", () => {
    const tied = apply(lastQuestion(), cast("p1", "s2"));
    const first = apply(tied, cast("p2", "s3"));
    expect(first.result?.accusedId).toBe("s2");

    const result = reduce(tied, cast("p2", "s3"), { ...testCtx, random: () => 0.99 });
    expect(result.ok && result.state.result?.accusedId).toBe("s3");
  });
});
