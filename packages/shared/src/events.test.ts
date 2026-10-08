import { describe, expect, it } from "vitest";
import { CreateRoomPayloadSchema, JoinRoomPayloadSchema } from "./events";
import { movesForSuspectCount } from "./room";

describe("socket payload schemas", () => {
  it("trims the player name and accepts 3–5 suspects", () => {
    const parsed = CreateRoomPayloadSchema.parse({ name: "  Anna ", language: "en", suspectCount: 5 });
    expect(parsed.name).toBe("Anna");
  });

  it.each([2, 6, 3.5])("rejects suspectCount %s", (suspectCount) => {
    expect(CreateRoomPayloadSchema.safeParse({ name: "Anna", language: "en", suspectCount }).success).toBe(false);
  });

  it("rejects blank and too long names", () => {
    expect(CreateRoomPayloadSchema.safeParse({ name: "   ", language: "en", suspectCount: 3 }).success).toBe(false);
    expect(CreateRoomPayloadSchema.safeParse({ name: "x".repeat(25), language: "en", suspectCount: 3 }).success).toBe(false);
  });

  it("rejects unknown languages", () => {
    expect(CreateRoomPayloadSchema.safeParse({ name: "Anna", language: "de", suspectCount: 3 }).success).toBe(false);
  });

  it("normalizes room codes to trimmed upper case", () => {
    expect(JoinRoomPayloadSchema.parse({ roomId: " k7qf2x ", name: "Boris" }).roomId).toBe("K7QF2X");
    expect(JoinRoomPayloadSchema.safeParse({ roomId: "K7QF", name: "Boris" }).success).toBe(false);
  });
});

describe("movesForSuspectCount", () => {
  it("is 3 per suspect plus 3", () => {
    expect([3, 4, 5].map(movesForSuspectCount)).toEqual([12, 15, 18]);
  });
});
