import { describe, expect, it } from "vitest";
import { toPublicView } from "./publicView";
import { apply, investigating, lobby } from "./testUtils";

describe("toPublicView", () => {
  it("has no case in the lobby", () => {
    const view = toPublicView(lobby());
    expect(view.case).toBeUndefined();
    expect(view.reveal).toBeUndefined();
    expect(view.players).toHaveLength(2);
  });

  it("never leaks hidden case data before the reveal", () => {
    const state = apply(
      investigating(),
      { type: "ask", playerId: "p1", suspectId: "s2", text: "Q-SENTINEL" },
      { type: "answerDone", text: "fine" },
      { type: "ask", playerId: "p2", suspectId: "s3", text: "PENDING-SENTINEL" },
    );
    const hidden = [
      ...state.case!.suspects.flatMap((s) => [s.secret, s.alibi.truth, s.persona.personality, ...s.knows]),
      state.case!.solution.motive,
      state.case!.solution.method,
    ];

    for (const s of [state, apply(state, { type: "answerDone", text: "ok" }, { type: "proposeVote", playerId: "p1" })]) {
      const view = toPublicView(s);
      const json = JSON.stringify(view);
      for (const text of hidden) expect(json).not.toContain(text);
      expect(json).not.toContain("isKiller");
      expect(view).not.toHaveProperty("suspectHistories");
      expect(view.reveal).toBeUndefined();
    }
    // The question itself is public (it is in the shared log, spec §6); only the duplicate field is dropped.
    expect(toPublicView(state).pendingAnswer).not.toHaveProperty("question");
    expect(toPublicView(state).pendingAnswer).toEqual({ suspectId: "s3", entryId: state.pendingAnswer!.entryId });
  });

  it("exposes public suspect fields and the briefing", () => {
    const view = toPublicView(investigating());
    expect(view.case?.suspects[0]).toEqual({
      id: "s1",
      name: "Margaret Hale",
      role: "the victim's wife",
      publicDescription: "Elegant and composed, married to Edmund for twenty years.",
    });
    expect(view.case?.briefing.causeOfDeath).toBe("Poisoning");
  });

  it("includes the full case after the reveal", () => {
    const revealed = apply(
      investigating(),
      { type: "proposeVote", playerId: "p1" },
      { type: "castVote", playerId: "p1", suspectId: "s1" },
      { type: "castVote", playerId: "p2", suspectId: "s1" },
    );
    const view = toPublicView(revealed);
    expect(view.reveal).toEqual(revealed.case);
    expect(view.result).toEqual({ accusedId: "s1", correct: true });
  });
});
