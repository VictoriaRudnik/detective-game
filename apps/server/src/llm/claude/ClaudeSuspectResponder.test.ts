import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { Case } from "@game/shared";
import { sampleCase } from "@game/shared/testing";
import { buildSuspectSystemPrompt } from "../prompts/suspectPrompt";
import { LlmError } from "../types";
import { ClaudeSuspectResponder } from "./ClaudeSuspectResponder";

const theCase: Case = { ...sampleCase(3), id: "c1" };
const suspect = theCase.suspects[1]!;

function stubClient(chunks: string[], stopReason = "end_turn") {
  const requests: Array<Record<string, unknown>> = [];
  const client = {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>) => {
          requests.push(params);
          return {
            on(event: string, listener: (text: string) => void) {
              if (event === "text") chunks.forEach((chunk) => listener(chunk));
              return this;
            },
            finalMessage: async () => ({
              stop_reason: stopReason,
              content: [
                { type: "thinking", thinking: "" },
                { type: "text", text: chunks.join("") },
              ],
            }),
          };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

const request = {
  case: theCase,
  suspect,
  history: [
    { role: "user" as const, content: "Who are you?" },
    { role: "assistant" as const, content: "The doctor." },
  ],
  question: "Where were you?",
};

describe("ClaudeSuspectResponder", () => {
  it("streams text deltas and returns the trimmed answer", async () => {
    const { client } = stubClient(["In the ", "drawing room. "]);
    const deltas: string[] = [];
    const answer = await new ClaudeSuspectResponder(client, "m").answer(request, (d) => deltas.push(d));
    expect(deltas).toEqual(["In the ", "drawing room. "]);
    expect(answer).toBe("In the drawing room.");
  });

  it("sends the cached persona, the history and the new question", async () => {
    const { client, requests } = stubClient(["Hm."]);
    await new ClaudeSuspectResponder(client, "model-y").answer(request, () => {});
    expect(requests[0]).toMatchObject({
      model: "model-y",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: [{ type: "text", text: buildSuspectSystemPrompt(theCase, suspect), cache_control: { type: "ephemeral" } }],
      messages: [
        { role: "user", content: "Who are you?" },
        { role: "assistant", content: "The doctor." },
        { role: "user", content: "Where were you?" },
      ],
    });
  });

  it("throws LlmError on a refusal", async () => {
    const { client } = stubClient(["No."], "refusal");
    await expect(new ClaudeSuspectResponder(client, "m").answer(request, () => {})).rejects.toBeInstanceOf(LlmError);
  });

  it("throws LlmError on an empty answer", async () => {
    const { client } = stubClient(["   "]);
    await expect(new ClaudeSuspectResponder(client, "m").answer(request, () => {})).rejects.toBeInstanceOf(LlmError);
  });
});
