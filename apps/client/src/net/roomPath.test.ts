import { describe, expect, it } from "vitest";
import { roomIdFromPath, roomUrl } from "./roomPath";

describe("roomPath", () => {
  it.each([
    ["/room/K7QF2X", "K7QF2X"],
    ["/room/k7qf2x/", "K7QF2X"],
    ["/", undefined],
    ["/room/K7Q", undefined],
    ["/room/K7QF2X/extra", undefined],
  ])("reads %s as %s", (path, expected) => {
    expect(roomIdFromPath(path)).toBe(expected);
  });

  it("builds an invite URL", () => {
    expect(roomUrl("K7QF2X", "https://game.example")).toBe("https://game.example/room/K7QF2X");
  });
});
