import type Anthropic from "@anthropic-ai/sdk";
import { buildSuspectSystemPrompt } from "../prompts/suspectPrompt";
import { LlmError, type AnswerRequest, type SuspectResponder } from "../types";
import { FALLBACK_BETA } from "./constants";

export class ClaudeSuspectResponder implements SuspectResponder {
  constructor(
    private readonly client: Anthropic,
    readonly model: string,
  ) {}

  async answer(req: AnswerRequest, onDelta: (text: string) => void): Promise<string> {
    const stream = this.client.beta.messages.stream({
      model: this.model,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low" },
      // The persona is identical for every question to this suspect, so it is cached.
      // Prompts below the model's minimum cacheable length are simply not cached.
      system: [{ type: "text", text: buildSuspectSystemPrompt(req.case, req.suspect), cache_control: { type: "ephemeral" } }],
      messages: [
        ...req.history.map((turn) => ({ role: turn.role, content: turn.content })),
        { role: "user", content: req.question },
      ],
    });
    stream.on("text", onDelta);
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") throw new LlmError("the suspect's answer was refused");
    const text = message.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    if (!text) throw new LlmError("the suspect returned an empty answer");
    return text;
  }
}
