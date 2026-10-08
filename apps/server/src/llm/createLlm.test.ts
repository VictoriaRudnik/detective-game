import { describe, expect, it } from "vitest";
import { ClaudeCaseGenerator } from "./claude/ClaudeCaseGenerator";
import { ClaudeSuspectResponder } from "./claude/ClaudeSuspectResponder";
import { createLlm } from "./createLlm";
import { FakeCaseGenerator, FakeSuspectResponder } from "./fakes";

describe("createLlm", () => {
  it("uses fakes when LLM_MODE=fake", () => {
    const llm = createLlm({ LLM_MODE: "fake" });
    expect(llm.caseGenerator).toBeInstanceOf(FakeCaseGenerator);
    expect(llm.suspectResponder).toBeInstanceOf(FakeSuspectResponder);
  });

  it("uses Claude with the default model", () => {
    const llm = createLlm({ ANTHROPIC_API_KEY: "test-key" });
    expect(llm.caseGenerator).toBeInstanceOf(ClaudeCaseGenerator);
    expect((llm.caseGenerator as ClaudeCaseGenerator).model).toBe("claude-opus-5-5");
    expect((llm.suspectResponder as ClaudeSuspectResponder).model).toBe("claude-opus-5-5");
  });

  it("lets each role use its own model", () => {
    const llm = createLlm({ ANTHROPIC_API_KEY: "k", CASE_MODEL: "case-model", SUSPECT_MODEL: "suspect-model" });
    expect((llm.caseGenerator as ClaudeCaseGenerator).model).toBe("case-model");
    expect((llm.suspectResponder as ClaudeSuspectResponder).model).toBe("suspect-model");
  });
});
