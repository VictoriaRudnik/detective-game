import { describe, expect, it } from "vitest";
import { makeView } from "../test/fixtures";
import { keepPendingDelta } from "./useRoom";

describe("keepPendingDelta", () => {
  const pendingView = makeView({ pendingAnswer: { suspectId: "s2", entryId: "a1" } });

  it("keeps only the text of the answer still being streamed", () => {
    expect(keepPendingDelta({ a1: "In the", old: "Done." }, pendingView)).toEqual({ a1: "In the" });
  });

  it("starts empty for a new pending answer", () => {
    expect(keepPendingDelta({}, pendingView)).toEqual({ a1: "" });
  });

  it("drops everything once no answer is pending", () => {
    expect(keepPendingDelta({ a1: "In the drawing room." }, makeView())).toEqual({});
  });
});
