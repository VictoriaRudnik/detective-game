import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameErrorCode, PublicRoomView } from "@game/shared";
import { testCtx } from "../engine/testUtils";
import { FakeCaseGenerator, FakeSuspectResponder } from "../llm/fakes";
import { LlmError } from "../llm/types";
import { RoomManager } from "./RoomManager";

function setup(options: { caseGenerator?: FakeCaseGenerator; newRoomId?: () => string } = {}) {
  const views: PublicRoomView[] = [];
  const deltas: string[] = [];
  const errors: GameErrorCode[] = [];
  const caseGenerator = options.caseGenerator ?? new FakeCaseGenerator();
  const suspectResponder = new FakeSuspectResponder();
  const manager = new RoomManager({
    caseGenerator,
    suspectResponder,
    ctx: testCtx,
    newRoomId: options.newRoomId,
    events: {
      state: (_roomId, view) => views.push(view),
      answerDelta: (_roomId, _entryId, text) => deltas.push(text),
      error: (_roomId, code) => errors.push(code),
    },
  });
  const roomId = manager.createRoom({ playerId: "p1", name: "Anna", language: "en", suspectCount: 3 });
  return { manager, roomId, views, deltas, errors, caseGenerator, suspectResponder, latest: () => views.at(-1)! };
}

async function startedGame() {
  const ctx = setup();
  ctx.manager.dispatch(ctx.roomId, { type: "start", playerId: "p1" });
  await ctx.manager.settle();
  return ctx;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("RoomManager", () => {
  it("creates a room with a 6-character code and publishes its view", () => {
    const { manager, roomId, views } = setup();
    expect(roomId).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/);
    expect(manager.getView(roomId)?.players).toEqual([{ id: "p1", name: "Anna", connected: true }]);
    expect(views).toHaveLength(1);
  });

  it("retries room codes that are already taken", () => {
    const codes = ["AAAAAA", "AAAAAA", "BBBBBB"];
    const { manager, roomId } = setup({ newRoomId: () => codes.shift()! });
    expect(roomId).toBe("AAAAAA");
    expect(manager.createRoom({ playerId: "p9", name: "Zed", language: "en", suspectCount: 3 })).toBe("BBBBBB");
  });

  it("reports unknown rooms and engine errors without publishing", () => {
    const { manager, roomId, views } = setup();
    expect(manager.dispatch("NOPE00", { type: "start", playerId: "p1" })).toBe("ROOM_NOT_FOUND");
    expect(manager.dispatch(roomId, { type: "start", playerId: "p2" })).toBe("NOT_HOST");
    expect(views).toHaveLength(1);
  });

  it("generates a case after the host starts", async () => {
    const { manager, roomId, latest, caseGenerator } = setup();
    manager.dispatch(roomId, { type: "start", playerId: "p1" });
    expect(latest().phase).toBe("generating");
    await manager.settle();
    expect(latest().phase).toBe("investigating");
    expect(latest().case?.suspects).toHaveLength(3);
    expect(caseGenerator.calls[0]?.req).toEqual({ language: "en", suspectCount: 3 });
  });

  it("returns to the lobby and reports an error when generation keeps failing", async () => {
    const failing = new FakeCaseGenerator({ results: [new LlmError("1"), new LlmError("2"), new LlmError("3")] });
    const { manager, roomId, latest, errors } = setup({ caseGenerator: failing });
    manager.dispatch(roomId, { type: "start", playerId: "p1" });
    await manager.settle();
    expect(latest().phase).toBe("lobby");
    expect(errors).toEqual(["CASE_GENERATION_FAILED"]);
  });

  it("streams a suspect's answer to the room and remembers the conversation", async () => {
    const { manager, roomId, latest, deltas, suspectResponder } = await startedGame();
    manager.dispatch(roomId, { type: "ask", playerId: "p1", suspectId: "s2", text: "Where were you?" });
    await manager.settle();

    const answer = latest().log.find((e) => e.kind === "answer");
    expect(answer).toMatchObject({ text: 'Dr. Arthur Finch: I know nothing about "Where were you?".' });
    expect(deltas.join("")).toBe('Dr. Arthur Finch: I know nothing about "Where were you?".');
    expect(latest().pendingAnswer).toBeUndefined();

    manager.dispatch(roomId, { type: "ask", playerId: "p1", suspectId: "s2", text: "Really?" });
    await manager.settle();
    expect(suspectResponder.calls[1]?.history).toHaveLength(2);
    expect(suspectResponder.calls[1]?.suspect.id).toBe("s2");
  });

  it("refunds the move when the suspect fails to answer", async () => {
    const { manager, roomId, latest, suspectResponder } = await startedGame();
    suspectResponder.failNext = 1;
    manager.dispatch(roomId, { type: "ask", playerId: "p1", suspectId: "s2", text: "Hello?" });
    await manager.settle();
    expect(latest().movesLeft).toBe(12);
    expect(latest().log.at(-1)).toMatchObject({ kind: "system", code: "SUSPECT_SILENT" });
  });

  it("deletes a room 30 minutes after the last player leaves", () => {
    vi.useFakeTimers();
    const { manager, roomId } = setup();
    manager.dispatch(roomId, { type: "disconnect", playerId: "p1" });
    vi.advanceTimersByTime(30 * 60_000 - 1);
    expect(manager.hasRoom(roomId)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(manager.hasRoom(roomId)).toBe(false);
  });

  it("keeps the room when someone comes back in time", () => {
    vi.useFakeTimers();
    const { manager, roomId } = setup();
    manager.dispatch(roomId, { type: "disconnect", playerId: "p1" });
    vi.advanceTimersByTime(10 * 60_000);
    manager.dispatch(roomId, { type: "join", playerId: "p1", name: "Anna" });
    vi.advanceTimersByTime(60 * 60_000);
    expect(manager.hasRoom(roomId)).toBe(true);
  });
});
