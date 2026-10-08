import { describe, expect, it } from "vitest";
import { sampleCase } from "@game/shared/testing";
import { validateCase } from "./caseValidator";

const req = { language: "en" as const, suspectCount: 4 };

describe("validateCase", () => {
  it.each([3, 4, 5])("accepts the sample case with %i suspects", (suspectCount) => {
    expect(validateCase(sampleCase(suspectCount), { language: "en", suspectCount })).toEqual([]);
  });

  it("rejects the wrong language", () => {
    expect(validateCase(sampleCase(4, "ru"), req)).toEqual([expect.stringContaining("language")]);
  });

  it("rejects the wrong number of suspects", () => {
    expect(validateCase(sampleCase(3), req)).toEqual([expect.stringContaining("expected 4 suspects")]);
  });

  it("rejects duplicate suspect ids", () => {
    const c = sampleCase(4);
    c.suspects[1]!.id = "s3";
    expect(validateCase(c, req)).toContainEqual(expect.stringContaining("unique"));
  });

  it("rejects zero or two killers", () => {
    const none = sampleCase(4);
    none.suspects[0]!.isKiller = false;
    expect(validateCase(none, req)).toContainEqual(expect.stringContaining("exactly one suspect"));

    const two = sampleCase(4);
    two.suspects[1]!.isKiller = true;
    expect(validateCase(two, req)).toContainEqual(expect.stringContaining("exactly one suspect"));
  });

  it("rejects a solution pointing at an innocent suspect", () => {
    const c = sampleCase(4);
    c.solution.killerId = "s2";
    expect(validateCase(c, req)).toContainEqual(expect.stringContaining("solution.killerId"));
  });

  it("rejects a killer whose claimed alibi equals the truth", () => {
    const c = sampleCase(4);
    c.suspects[0]!.alibi.truth = `  ${c.suspects[0]!.alibi.claimed.toUpperCase()} `;
    expect(validateCase(c, req)).toContainEqual(expect.stringContaining("alibi"));
  });

  it("rejects empty key evidence", () => {
    const c = sampleCase(4);
    c.solution.keyEvidence = [];
    expect(validateCase(c, req)).toContainEqual(expect.stringContaining("keyEvidence must not be empty"));
  });

  it("rejects key evidence that only the killer knows", () => {
    const c = sampleCase(4);
    c.solution.keyEvidence.push(c.suspects[0]!.knows[0]!);
    expect(validateCase(c, req)).toContainEqual(expect.stringContaining("innocent suspect"));
  });

  it("matches key evidence case-insensitively after trimming", () => {
    const c = sampleCase(4);
    c.solution.keyEvidence = c.solution.keyEvidence.map((e) => ` ${e.toUpperCase()} `);
    expect(validateCase(c, req)).toEqual([]);
  });

  it("rejects blank text fields and names their path", () => {
    const c = sampleCase(4);
    c.suspects[2]!.secret = "   ";
    expect(validateCase(c, req)).toEqual(["case.suspects[2].secret must not be empty"]);
  });
});
