import type Groq from "groq-sdk";
import { describe, expect, it } from "vitest";
import type { Case } from "@game/shared";
import { sampleCase } from "@game/shared/testing";
import { buildSuspectSystemPrompt } from "../prompts/suspectPrompt";
import { LlmError } from "../types";
import { GroqSuspectResponder } from "./GroqSuspectResponder";

const theCase: Case = { ...sampleCase(3), id: "c1" };
const suspect = theCase.suspects[1]!;

const chunk = (content: string | null, finish_reason: string | null = null) => ({ choices: [{ index: 0, delta: { content }, finish_reason }] });

function stubClient(chunks: unknown[]) {
  const requests: Array<Record<string, unknown>> = [];
  const client = {
    chat: {
      completions: {
        create: async (params: Record<string, unknown>) => {
          requests.push(params);
          return (async function* () {
            yield* chunks;
          })();
        },
      },
    },
  } as unknown as Groq;
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

describe("GroqSuspectResponder", () => {
  it("streams text deltas and returns the trimmed answer", async () => {
    const { client } = stubClient([chunk("In the "), chunk(null), chunk("drawing room. "), chunk(null, "stop")]);
    const deltas: string[] = [];
    const answer = await new GroqSuspectResponder(client, "m").answer(request, (d) => deltas.push(d));
    expect(deltas).toEqual(["In the ", "drawing room. "]);
    expect(answer).toBe("In the drawing room.");
  });

  it("sends the persona, the history and the new question with low reasoning, hiding the reasoning", async () => {
    const { client, requests } = stubClient([chunk("Hm.", "stop")]);
    await new GroqSuspectResponder(client, "model-y").answer(request, () => {});
    expect(requests[0]).toMatchObject({
      model: "model-y",
      stream: true,
      reasoning_effort: "low",
      include_reasoning: false,
      messages: [
        { role: "system", content: buildSuspectSystemPrompt(theCase, suspect) },
        { role: "user", content: "Who are you?" },
        { role: "assistant", content: "The doctor." },
        { role: "user", content: "Where were you?" },
      ],
    });
  });

  it.each([
    ["a truncated answer", [chunk("I was", "length")]],
    ["a stream that ends without finishing", [chunk("I was")]],
    ["an empty answer", [chunk("   ", "stop")]],
  ])("throws LlmError on %s", async (_label, chunks) => {
    const { client } = stubClient(chunks);
    await expect(new GroqSuspectResponder(client, "m").answer(request, () => {})).rejects.toBeInstanceOf(LlmError);
  });
});
