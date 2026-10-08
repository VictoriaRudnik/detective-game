import Anthropic from "@anthropic-ai/sdk";
import { ClaudeCaseGenerator } from "./claude/ClaudeCaseGenerator";
import { ClaudeSuspectResponder } from "./claude/ClaudeSuspectResponder";
import { DEFAULT_MODEL } from "./claude/constants";
import { FakeCaseGenerator, FakeSuspectResponder } from "./fakes";
import type { CaseGenerator, SuspectResponder } from "./types";

export interface Llm {
  caseGenerator: CaseGenerator;
  suspectResponder: SuspectResponder;
}

/** LLM_MODE=fake plays without API calls; otherwise Claude, with per-role model overrides. */
export function createLlm(env: Record<string, string | undefined>): Llm {
  if (env.LLM_MODE === "fake") {
    return {
      caseGenerator: new FakeCaseGenerator({ delayMs: 1500 }),
      suspectResponder: new FakeSuspectResponder({ chunkDelayMs: 40 }),
    };
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return {
    caseGenerator: new ClaudeCaseGenerator(client, env.CASE_MODEL ?? DEFAULT_MODEL),
    suspectResponder: new ClaudeSuspectResponder(client, env.SUSPECT_MODEL ?? DEFAULT_MODEL),
  };
}
