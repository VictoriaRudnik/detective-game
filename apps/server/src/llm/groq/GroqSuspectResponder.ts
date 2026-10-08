import type Groq from "groq-sdk";
import { buildSuspectSystemPrompt } from "../prompts/suspectPrompt";
import { LlmError, type AnswerRequest, type SuspectResponder } from "../types";

export class GroqSuspectResponder implements SuspectResponder {
  constructor(
    private readonly client: Groq,
    readonly model: string,
  ) {}

  async answer(req: AnswerRequest, onDelta: (text: string) => void): Promise<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      stream: true,
      max_completion_tokens: 4000,
      reasoning_effort: "low",
      include_reasoning: false,
      messages: [
        { role: "system", content: buildSuspectSystemPrompt(req.case, req.suspect) },
        ...req.history.map((turn) => ({ role: turn.role, content: turn.content })),
        { role: "user", content: req.question },
      ],
    });

    let text = "";
    let finishReason: string | null | undefined;
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      const delta = choice?.delta.content;
      if (delta) {
        text += delta;
        onDelta(delta);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
    }
    if (finishReason !== "stop") throw new LlmError(`the suspect's answer stopped with ${finishReason ?? "no finish"}`);
    const answer = text.trim();
    if (!answer) throw new LlmError("the suspect returned an empty answer");
    return answer;
  }
}
