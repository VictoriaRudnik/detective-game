import { vi } from "vitest";
import { toPublicCase, type Case, type PublicRoomView } from "@game/shared";
import { sampleCase } from "@game/shared/testing";
import type { RoomActions } from "../net/useRoom";

/** Three suspects; the killer is s1 "Margaret Hale". */
export const fullCase: Case = { ...sampleCase(3), id: "case1" };

/** Anna (p1, host, has the turn) and Boris (p2) investigating the sample case. */
export function makeView(overrides: Partial<PublicRoomView> = {}): PublicRoomView {
  return {
    id: "K7QF2X",
    hostId: "p1",
    language: "en",
    suspectCount: 3,
    players: [
      { id: "p1", name: "Anna", connected: true },
      { id: "p2", name: "Boris", connected: true },
    ],
    phase: "investigating",
    movesLeft: 12,
    turnPlayerId: "p1",
    log: [],
    case: toPublicCase(fullCase),
    ...overrides,
  };
}

export function makeActions() {
  return {
    create: vi.fn(async () => undefined),
    join: vi.fn(async () => undefined),
    start: vi.fn(),
    ask: vi.fn(),
    chat: vi.fn(),
    proposeVote: vi.fn(),
    castVote: vi.fn(),
    restart: vi.fn(),
  } satisfies RoomActions;
}
