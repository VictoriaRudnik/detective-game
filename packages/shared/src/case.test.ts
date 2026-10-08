import { describe, expect, it } from "vitest";
import { CaseSchema, GeneratedCaseSchema, toPublicCase } from "./case";
import { sampleCase } from "./testing/sampleCase";

describe("case schemas", () => {
  it.each([3, 4, 5])("sampleCase(%i) is a valid generated case", (count) => {
    const c = sampleCase(count);
    expect(GeneratedCaseSchema.parse(c)).toEqual(c);
    expect(c.suspects).toHaveLength(count);
    expect(c.suspects.filter((s) => s.isKiller).map((s) => s.id)).toEqual(["s1"]);
  });

  it("sampleCase uses the requested language", () => {
    expect(sampleCase(3, "ru").language).toBe("ru");
  });

  it("rejects a case with a missing field", () => {
    const { briefing: _omit, ...broken } = sampleCase(3);
    expect(GeneratedCaseSchema.safeParse(broken).success).toBe(false);
  });

  it("CaseSchema requires an id", () => {
    expect(CaseSchema.safeParse(sampleCase(3)).success).toBe(false);
    expect(CaseSchema.safeParse({ ...sampleCase(3), id: "c1" }).success).toBe(true);
  });

  it("lists solution before suspects so the model writes the truth first", () => {
    const keys = Object.keys(GeneratedCaseSchema.shape);
    expect(keys.indexOf("solution")).toBeLessThan(keys.indexOf("suspects"));
  });
});

describe("toPublicCase", () => {
  it("keeps only public suspect fields and drops the solution", () => {
    const pub = toPublicCase({ ...sampleCase(3), id: "c1" });
    expect(Object.keys(pub).sort()).toEqual(["briefing", "language", "suspects", "title"]);
    expect(Object.keys(pub.suspects[0]!).sort()).toEqual(["id", "name", "publicDescription", "role"]);
  });
});
