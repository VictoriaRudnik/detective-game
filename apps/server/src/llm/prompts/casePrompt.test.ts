import { describe, expect, it } from "vitest";
import { buildCaseUserPrompt } from "./casePrompt";

describe("buildCaseUserPrompt", () => {
  it("states the suspect count, the ids and the language", () => {
    const prompt = buildCaseUserPrompt({ language: "ru", suspectCount: 4 });
    expect(prompt).toContain("exactly 4 suspects");
    expect(prompt).toContain("s1, s2, s3, s4");
    expect(prompt).toContain("Russian");
    expect(prompt).toContain('set language to "ru"');
  });

  it("has no feedback section on the first attempt", () => {
    expect(buildCaseUserPrompt({ language: "en", suspectCount: 3 })).not.toContain("previous attempt");
  });

  it("lists every problem from the previous attempt", () => {
    const prompt = buildCaseUserPrompt({ language: "en", suspectCount: 3 }, ["problem one", "problem two"]);
    expect(prompt).toContain("previous attempt");
    expect(prompt).toContain("- problem one\n- problem two");
  });
});
