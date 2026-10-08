import { describe, expect, it } from "vitest";
import { ClaudeCaseGenerator } from "./claude/ClaudeCaseGenerator";
import { ClaudeSuspectResponder } from "./claude/ClaudeSuspectResponder";
import { createLlm } from "./createLlm";
import { FakeCaseGenerator, FakeSuspectResponder } from "./fakes";
import { GroqCaseGenerator } from "./groq/GroqCaseGenerator";
import { GroqSuspectResponder } from "./groq/GroqSuspectResponder";

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

  it("rejects an unknown provider", () => {
    expect(() => createLlm({ LLM_PROVIDER: "gpt" })).toThrow(/LLM_PROVIDER/);
  });

  it("lets fake mode win over the provider", () => {
    expect(createLlm({ LLM_MODE: "fake", LLM_PROVIDER: "groq" }).caseGenerator).toBeInstanceOf(FakeCaseGenerator);
  });

  it("uses Groq with the default model when LLM_PROVIDER=groq", () => {
    const llm = createLlm({ LLM_PROVIDER: "groq", GROQ_API_KEY: "test-key" });
    expect(llm.caseGenerator).toBeInstanceOf(GroqCaseGenerator);
    expect(llm.suspectResponder).toBeInstanceOf(GroqSuspectResponder);
    expect((llm.caseGenerator as GroqCaseGenerator).model).toBe("openai/gpt-oss-120b");
    expect((llm.suspectResponder as GroqSuspectResponder).model).toBe("openai/gpt-oss-120b");
  });

  it("lets each role use its own Groq model", () => {
    const llm = createLlm({ LLM_PROVIDER: "groq", GROQ_API_KEY: "k", CASE_MODEL: "case-model", SUSPECT_MODEL: "suspect-model" });
    expect(llm.caseGenerator).toBeInstanceOf(GroqCaseGenerator);
    expect((llm.caseGenerator as GroqCaseGenerator).model).toBe("case-model");
    expect((llm.suspectResponder as GroqSuspectResponder).model).toBe("suspect-model");
  });

  it("refuses to start Groq without an API key", () => {
    expect(() => createLlm({ LLM_PROVIDER: "groq" })).toThrow(/GROQ_API_KEY/);
  });
});
