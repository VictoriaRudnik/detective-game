import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";
import { ClaudeCaseGenerator } from "./claude/ClaudeCaseGenerator";
import { ClaudeSuspectResponder } from "./claude/ClaudeSuspectResponder";
import { DEFAULT_MODEL } from "./claude/constants";
import { FakeCaseGenerator, FakeSuspectResponder } from "./fakes";
import { GroqCaseGenerator } from "./groq/GroqCaseGenerator";
import { GroqSuspectResponder } from "./groq/GroqSuspectResponder";
import type { CaseGenerator, SuspectResponder } from "./types";

const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

export interface Llm {
  caseGenerator: CaseGenerator;
  suspectResponder: SuspectResponder;
}

/**
 * LLM_MODE=fake plays without API calls; otherwise LLM_PROVIDER picks claude (default) or groq,
 * with per-role model overrides.
 */
export function createLlm(env: Record<string, string | undefined>): Llm {
  if (env.LLM_MODE === "fake") {
    return {
      caseGenerator: new FakeCaseGenerator({ delayMs: 1500 }),
      suspectResponder: new FakeSuspectResponder({ chunkDelayMs: 40 }),
    };
  }

  const provider = env.LLM_PROVIDER ?? "claude";
  if (provider === "groq") {
    if (!env.GROQ_API_KEY) throw new Error("LLM_PROVIDER=groq needs GROQ_API_KEY in apps/server/.env");
    const client = new Groq({ apiKey: env.GROQ_API_KEY });
    return {
      caseGenerator: new GroqCaseGenerator(client, env.CASE_MODEL ?? DEFAULT_GROQ_MODEL),
      suspectResponder: new GroqSuspectResponder(client, env.SUSPECT_MODEL ?? DEFAULT_GROQ_MODEL),
    };
  }
  if (provider !== "claude") throw new Error(`Unknown LLM_PROVIDER "${provider}": use claude or groq`);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return {
    caseGenerator: new ClaudeCaseGenerator(client, env.CASE_MODEL ?? DEFAULT_MODEL),
    suspectResponder: new ClaudeSuspectResponder(client, env.SUSPECT_MODEL ?? DEFAULT_MODEL),
  };
}
