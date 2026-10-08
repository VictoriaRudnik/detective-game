import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { GeneratedCaseSchema, type GeneratedCase } from "@game/shared";
import { buildCaseUserPrompt, CASE_SYSTEM_PROMPT } from "../prompts/casePrompt";
import { LlmError, type CaseGenerator, type CaseRequest } from "../types";
import { FALLBACK_BETA } from "./constants";

export class ClaudeCaseGenerator implements CaseGenerator {
  constructor(
    private readonly client: Anthropic,
    readonly model: string,
  ) {}

  async generate(req: CaseRequest, feedback: string[] = []): Promise<GeneratedCase> {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 32000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: betaZodOutputFormat(GeneratedCaseSchema) },
      system: CASE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildCaseUserPrompt(req, feedback) }],
    });
    if (response.stop_reason !== "end_turn") {
      throw new LlmError(`case generation stopped with ${response.stop_reason}`);
    }
    if (!response.parsed_output) {
      throw new LlmError("case generation returned no parsable output");
    }
    return response.parsed_output;
  }
}
