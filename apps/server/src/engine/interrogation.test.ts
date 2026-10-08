import { describe, expect, it } from "vitest";
import type { RoomState } from "@game/shared";
import { apply, errorOf, investigating, lobby } from "./testUtils";

const ask = (playerId: string, text = "Where were you at ten?", suspectId = "s2") =>
  ({ type: "ask", playerId, suspectId, text }) as const;
const done = (text = "In the drawing room.") => ({ type: "answerDone", text }) as const;

describe("ask", () => {
  it("logs the question and an empty answer, spends a move and waits for the answer", () => {
    const s = apply(investigating(), ask("p1", "  Where were you?  "));
    const [question, answer] = s.log;
    expect(question).toMatchObject({ kind: "question", playerId: "p1", suspectId: "s2", text: "Where were you?" });
    expect(answer).toMatchObject({ kind: "answer", suspectId: "s2", text: "" });
    expect(s.movesLeft).toBe(11);
    expect(s.pendingAnswer).toEqual({ suspectId: "s2", entryId: answer!.id, question: "Where were you?" });
  });

  it.each<[string, string, (s: RoomState) => RoomState, ReturnType<typeof ask>]>([
    ["WRONG_PHASE", "outside the investigation", () => lobby(), ask("p1")],
    ["NOT_YOUR_TURN", "by a player whose turn it is not", (s) => s, ask("p2")],
    ["ANSWER_IN_PROGRESS", "while a suspect is answering", (s) => apply(s, ask("p1")), ask("p1")],
    ["NO_MOVES_LEFT", "without moves left", (s) => ({ ...s, movesLeft: 0 }), ask("p1")],
    ["UNKNOWN_SUSPECT", "to an unknown suspect", (s) => s, ask("p1", "Hi", "s9")],
    ["INVALID_TEXT", "with blank text", (s) => s, ask("p1", "   ")],
    ["INVALID_TEXT", "with text over 500 characters", (s) => s, ask("p1", "x".repeat(501))],
  ])("rejects with %s when asked %s", (code, _description, prepare, action) => {
    expect(errorOf(prepare(investigating()), action)).toBe(code);
  });
});

describe("answerDone", () => {
  it("fills the answer, records the suspect's history and passes the turn", () => {
    const s = apply(investigating(), ask("p1", "Where?"), done("Nowhere."));
    expect(s.log[1]).toMatchObject({ kind: "answer", text: "Nowhere." });
    expect(s.suspectHistories.s2).toEqual([
      { role: "user", content: "Where?" },
      { role: "assistant", content: "Nowhere." },
    ]);
    expect(s.pendingAnswer).toBeUndefined();
    expect(s.turnPlayerId).toBe("p2");
  });

  it("wraps the turn around to the first player", () => {
    const s = apply(investigating(), ask("p1"), done(), ask("p2"), done());
    expect(s.turnPlayerId).toBe("p1");
  });

  it("skips disconnected players", () => {
    const s = apply(investigating(["p1", "p2", "p3"]), { type: "disconnect", playerId: "p2" }, ask("p1"), done());
    expect(s.turnPlayerId).toBe("p3");
  });

  it("moves the turn on when the asker went offline mid-answer", () => {
    const s = apply(investigating(), ask("p1"), { type: "disconnect", playerId: "p1" }, done());
    expect(s.turnPlayerId).toBe("p2");
  });

  it("is rejected when no answer is pending", () => {
    expect(errorOf(investigating(), done())).toBe("WRONG_PHASE");
  });
});

describe("answerFailed", () => {
  it("removes the empty answer, refunds the move and keeps the turn", () => {
    const s = apply(investigating(), ask("p1"), { type: "answerFailed" });
    expect(s.log.map((e) => e.kind)).toEqual(["question", "system"]);
    expect(s.log[1]).toMatchObject({ kind: "system", code: "SUSPECT_SILENT" });
    expect(s.movesLeft).toBe(12);
    expect(s.pendingAnswer).toBeUndefined();
    expect(s.turnPlayerId).toBe("p1");
    expect(s.suspectHistories.s2).toEqual([]);
  });

  it("passes the turn when the asker is offline", () => {
    const s = apply(investigating(), ask("p1"), { type: "disconnect", playerId: "p1" }, { type: "answerFailed" });
    expect(s.turnPlayerId).toBe("p2");
  });
});

describe("turns and disconnects", () => {
  it("passes an idle turn when the active player disconnects", () => {
    expect(apply(investigating(), { type: "disconnect", playerId: "p1" }).turnPlayerId).toBe("p2");
  });

  it("keeps the turn while that player's question is being answered", () => {
    expect(apply(investigating(), ask("p1"), { type: "disconnect", playerId: "p1" }).turnPlayerId).toBe("p1");
  });

  it("leaves nobody holding the turn when everyone is offline", () => {
    const s = apply(investigating(), { type: "disconnect", playerId: "p1" }, { type: "disconnect", playerId: "p2" });
    expect(s.turnPlayerId).toBeUndefined();
  });
});

describe("chat", () => {
  it("adds a chat entry in any phase without spending moves", () => {
    const s = apply(lobby(), { type: "chat", playerId: "p2", text: " hello " });
    expect(s.log).toEqual([expect.objectContaining({ kind: "chat", playerId: "p2", text: "hello" })]);
  });

  it("rejects blank text and unknown players", () => {
    expect(errorOf(lobby(), { type: "chat", playerId: "p2", text: " " })).toBe("INVALID_TEXT");
    expect(errorOf(lobby(), { type: "chat", playerId: "zz", text: "hi" })).toBe("UNKNOWN_PLAYER");
  });
});
