import { describe, expect, it } from "vitest";
import { sampleCase } from "@game/shared/testing";
import { FakeCaseGenerator } from "./fakes";
import { generateValidCase } from "./generateValidCase";
import { LlmError } from "./types";

const req = { language: "en" as const, suspectCount: 4 };

describe("generateValidCase", () => {
  it("returns the first valid case", async () => {
    const generator = new FakeCaseGenerator();
    await expect(generateValidCase(generator, req)).resolves.toEqual(sampleCase(4));
    expect(generator.calls).toEqual([{ req, feedback: [] }]);
  });

  it("retries with the validator's problems as feedback", async () => {
    const generator = new FakeCaseGenerator({ results: [sampleCase(3)] });
    await expect(generateValidCase(generator, req)).resolves.toEqual(sampleCase(4));
    expect(generator.calls[1]?.feedback).toEqual(["expected 4 suspects, got 3"]);
  });

  it("retries after a thrown error", async () => {
    const generator = new FakeCaseGenerator({ results: [new Error("network down")] });
    await expect(generateValidCase(generator, req)).resolves.toEqual(sampleCase(4));
    expect(generator.calls).toHaveLength(2);
  });

  it("gives up after three attempts", async () => {
    const generator = new FakeCaseGenerator({ results: [new Error("1"), sampleCase(3), new Error("3")] });
    const failure = generateValidCase(generator, req);
    await expect(failure).rejects.toBeInstanceOf(LlmError);
    await expect(failure).rejects.toThrow("case generation failed after 3 attempts");
    expect(generator.calls).toHaveLength(3);
  });
});
