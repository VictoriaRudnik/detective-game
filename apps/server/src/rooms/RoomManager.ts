import type { GameErrorCode, Language, PublicRoomView, RoomState } from "@game/shared";
import type { Action } from "../engine/actions";
import { toPublicView } from "../engine/publicView";
import { reduce } from "../engine/reducer";
import { createRoom } from "../engine/state";
import type { EngineCtx } from "../engine/types";
import { generateValidCase } from "../llm/generateValidCase";
import type { CaseGenerator, SuspectResponder } from "../llm/types";
import { generateRoomId } from "./roomId";

/** How the manager talks to the outside world (Socket.IO in production, arrays in tests). */
export interface RoomEvents {
  state(roomId: string, view: PublicRoomView): void;
  answerDelta(roomId: string, entryId: string, text: string): void;
  error(roomId: string, code: GameErrorCode): void;
}

export interface RoomManagerDeps {
  caseGenerator: CaseGenerator;
  suspectResponder: SuspectResponder;
  events: RoomEvents;
  ctx: EngineCtx;
  newRoomId?: () => string;
  emptyRoomTtlMs?: number;
}

const DEFAULT_EMPTY_ROOM_TTL_MS = 30 * 60_000;

/** Owns all rooms: applies actions through the engine, publishes views and runs LLM side effects. */
export class RoomManager {
  private readonly rooms = new Map<string, RoomState>();
  private readonly cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly inFlight = new Set<Promise<void>>();

  constructor(private readonly deps: RoomManagerDeps) {}

  createRoom(p: { playerId: string; name: string; language: Language; suspectCount: number }): string {
    const newRoomId = this.deps.newRoomId ?? generateRoomId;
    let roomId = newRoomId();
    while (this.rooms.has(roomId)) roomId = newRoomId();

    this.rooms.set(
      roomId,
      createRoom({ roomId, hostId: p.playerId, hostName: p.name, language: p.language, suspectCount: p.suspectCount }),
    );
    this.publish(roomId);
    return roomId;
  }

  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  getView(roomId: string): PublicRoomView | undefined {
    const room = this.rooms.get(roomId);
    return room && toPublicView(room);
  }

  dispatch(roomId: string, action: Action): GameErrorCode | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return "ROOM_NOT_FOUND";
    const result = reduce(room, action, this.deps.ctx);
    if (!result.ok) return result.error;

    this.rooms.set(roomId, result.state);
    this.publish(roomId);
    this.scheduleCleanup(roomId);
    if (action.type === "start") this.track(this.runGeneration(roomId, result.state));
    if (action.type === "ask") this.track(this.runAnswer(roomId, result.state));
    return undefined;
  }

  /** Resolves once all running LLM work has finished. For tests and graceful shutdown. */
  async settle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }

  dispose(): void {
    for (const timer of this.cleanupTimers.values()) clearTimeout(timer);
    this.cleanupTimers.clear();
  }

  private publish(roomId: string): void {
    const view = this.getView(roomId);
    if (view) this.deps.events.state(roomId, view);
  }

  private track(work: Promise<void>): void {
    this.inFlight.add(work);
    void work.finally(() => this.inFlight.delete(work));
  }

  private async runGeneration(roomId: string, room: RoomState): Promise<void> {
    try {
      const generated = await generateValidCase(this.deps.caseGenerator, {
        language: room.language,
        suspectCount: room.suspectCount,
      });
      this.dispatch(roomId, { type: "caseReady", case: { ...generated, id: this.deps.ctx.newId() } });
    } catch (error) {
      console.error(`[room ${roomId}] case generation failed`, error);
      if (this.dispatch(roomId, { type: "caseFailed" }) === undefined) {
        this.deps.events.error(roomId, "CASE_GENERATION_FAILED");
      }
    }
  }

  private async runAnswer(roomId: string, room: RoomState): Promise<void> {
    const pending = room.pendingAnswer;
    const suspect = room.case?.suspects.find((s) => s.id === pending?.suspectId);
    if (!pending || !room.case || !suspect) return;
    try {
      const text = await this.deps.suspectResponder.answer(
        { case: room.case, suspect, history: room.suspectHistories[suspect.id] ?? [], question: pending.question },
        (delta) => this.deps.events.answerDelta(roomId, pending.entryId, delta),
      );
      this.dispatch(roomId, { type: "answerDone", text });
    } catch (error) {
      console.error(`[room ${roomId}] suspect ${suspect.id} failed to answer`, error);
      this.dispatch(roomId, { type: "answerFailed" });
    }
  }

  private scheduleCleanup(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const timer = this.cleanupTimers.get(roomId);
    if (room.players.some((p) => p.connected)) {
      if (timer) clearTimeout(timer);
      this.cleanupTimers.delete(roomId);
      return;
    }
    if (timer) return;
    const ttl = this.deps.emptyRoomTtlMs ?? DEFAULT_EMPTY_ROOM_TTL_MS;
    const handle = setTimeout(() => {
      this.rooms.delete(roomId);
      this.cleanupTimers.delete(roomId);
    }, ttl);
    handle.unref?.();
    this.cleanupTimers.set(roomId, handle);
  }
}
