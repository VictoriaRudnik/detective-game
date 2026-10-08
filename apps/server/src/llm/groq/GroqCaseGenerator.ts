import type Groq from "groq-sdk";
import type { GeneratedCase } from "@game/shared";
import { CASE_JSON_SCHEMA, parseCaseJson } from "../caseJson";
import { buildCaseUserPrompt, CASE_SYSTEM_PROMPT } from "../prompts/casePrompt";
import { LlmError, type CaseGenerator, type CaseRequest } from "../types";

export class GroqCaseGenerator implements CaseGenerator {
  constructor(
    private readonly client: Groq,
    readonly model: string,
  ) {}

  async generate(req: CaseRequest, feedback: string[] = []): Promise<GeneratedCase> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      max_completion_tokens: 32000,
      reasoning_effort: "high",
      response_format: { type: "json_schema", json_schema: { name: "murder_case", strict: true, schema: CASE_JSON_SCHEMA } },
      messages: [
        { role: "system", content: CASE_SYSTEM_PROMPT },
        { role: "user", content: buildCaseUserPrompt(req, feedback) },
      ],
    });
    const choice = completion.choices[0];
    if (choice?.finish_reason !== "stop") throw new LlmError(`case generation stopped with ${choice?.finish_reason ?? "no choice"}`);
    return parseCaseJson(choice.message.content);
  }
}
