import { describe, expect, it } from "vitest";
import { sampleCase } from "@game/shared/testing";
import { reduce } from "./reducer";
import { createRoom } from "./state";
import { apply, errorOf, investigating, lobby, testCtx } from "./testUtils";

describe("createRoom", () => {
  it("creates a lobby with the connected host", () => {
    const room = createRoom({ roomId: "ABC234", hostId: "p1", hostName: "Anna", language: "ru", suspectCount: 4 });
    expect(room).toMatchObject({
      id: "ABC234",
      hostId: "p1",
      language: "ru",
      suspectCount: 4,
      phase: "lobby",
      players: [{ id: "p1", name: "Anna", connected: true }],
    });
  });
});

describe("join", () => {
  it("adds a new player", () => {
    expect(lobby(["p1", "p2"]).players.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("reconnects a known player without duplicating them", () => {
    const s = apply(lobby(), { type: "disconnect", playerId: "p2" }, { type: "join", playerId: "p2", name: "Boris" });
    expect(s.players).toEqual([
      { id: "p1", name: "P1", connected: true },
      { id: "p2", name: "Boris", connected: true },
    ]);
  });

  it("makes the joiner host when the host is offline", () => {
    const s = apply(lobby(["p1"]), { type: "disconnect", playerId: "p1" }, { type: "join", playerId: "p9", name: "Late" });
    expect(s.hostId).toBe("p9");
  });

  it("gives the turn to a joiner when nobody holds it during the investigation", () => {
    const s = apply(
      investigating(["p1"]),
      { type: "disconnect", playerId: "p1" },
      { type: "join", playerId: "p2", name: "Boris" },
    );
    expect(s.turnPlayerId).toBe("p2");
  });
});

describe("disconnect", () => {
  it("marks the player offline and moves the host role to the next connected player", () => {
    const s = apply(lobby(["p1", "p2", "p3"]), { type: "disconnect", playerId: "p1" });
    expect(s.players[0]!.connected).toBe(false);
    expect(s.hostId).toBe("p2");
  });

  it("keeps the host when nobody else is connected", () => {
    const s = apply(lobby(["p1"]), { type: "disconnect", playerId: "p1" });
    expect(s.hostId).toBe("p1");
  });

  it("rejects unknown players", () => {
    expect(errorOf(lobby(), { type: "disconnect", playerId: "nobody" })).toBe("UNKNOWN_PLAYER");
  });
});

describe("start", () => {
  it("lets only the host start, and only from the lobby", () => {
    expect(errorOf(lobby(), { type: "start", playerId: "p2" })).toBe("NOT_HOST");
    const generating = apply(lobby(), { type: "start", playerId: "p1" });
    expect(generating.phase).toBe("generating");
    expect(errorOf(generating, { type: "start", playerId: "p1" })).toBe("WRONG_PHASE");
  });
});

describe("caseReady / caseFailed", () => {
  it("starts the investigation with the move budget and the first connected player's turn", () => {
    const s = investigating(["p1", "p2"], 3);
    expect(s.phase).toBe("investigating");
    expect(s.case?.id).toBe("case1");
    expect(s.movesLeft).toBe(12);
    expect(s.turnPlayerId).toBe("p1");
    expect(s.suspectHistories).toEqual({ s1: [], s2: [], s3: [] });
  });

  it("rejects a case outside the generating phase", () => {
    expect(errorOf(lobby(), { type: "caseReady", case: { ...sampleCase(3), id: "c" } })).toBe("WRONG_PHASE");
  });

  it("returns to the lobby when generation fails", () => {
    const s = apply(lobby(), { type: "start", playerId: "p1" }, { type: "caseFailed" });
    expect(s.phase).toBe("lobby");
  });
});

describe("restart", () => {
  it("resets a revealed game to the lobby, host only", () => {
    const revealed = { ...investigating(), phase: "revealed" as const };
    expect(errorOf(revealed, { type: "restart", playerId: "p2" })).toBe("NOT_HOST");
    const s = apply(revealed, { type: "restart", playerId: "p1" });
    expect(s).toMatchObject({ phase: "lobby", movesLeft: 0, log: [], suspectHistories: {} });
    expect(s.case).toBeUndefined();
    expect(s.players).toHaveLength(2);
  });

  it("is only allowed after the reveal", () => {
    expect(errorOf(investigating(), { type: "restart", playerId: "p1" })).toBe("WRONG_PHASE");
  });
});

describe("reduce", () => {
  it("never mutates the input state", () => {
    const before = lobby();
    const snapshot = structuredClone(before);
    reduce(before, { type: "join", playerId: "p3", name: "C" }, testCtx);
    reduce(before, { type: "start", playerId: "p2" }, testCtx);
    expect(before).toEqual(snapshot);
  });
});
