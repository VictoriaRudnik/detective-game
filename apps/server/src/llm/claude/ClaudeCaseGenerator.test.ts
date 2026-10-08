import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { sampleCase } from "@game/shared/testing";
import { LlmError } from "../types";
import { ClaudeCaseGenerator } from "./ClaudeCaseGenerator";

function stubClient(response: unknown) {
  const requests: Array<Record<string, unknown>> = [];
  const client = {
    beta: {
      messages: {
        parse: async (params: Record<string, unknown>) => {
          requests.push(params);
          return response;
        },
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

describe("ClaudeCaseGenerator", () => {
  it("requests a structured case with adaptive thinking, high effort and refusal fallbacks", async () => {
    const { client, requests } = stubClient({ stop_reason: "end_turn", parsed_output: sampleCase(3) });
    const generated = await new ClaudeCaseGenerator(client, "model-x").generate({ language: "en", suspectCount: 3 }, ["fix it"]);

    expect(generated).toEqual(sampleCase(3));
    expect(requests[0]).toMatchObject({
      model: "model-x",
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: expect.anything() },
    });
    const messages = requests[0]!.messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toContain("exactly 3 suspects");
    expect(messages[0]!.content).toContain("- fix it");
  });

  it.each([
    ["a refusal", { stop_reason: "refusal", parsed_output: null }],
    ["a truncated response", { stop_reason: "max_tokens", parsed_output: null }],
    ["missing parsed output", { stop_reason: "end_turn", parsed_output: null }],
  ])("throws LlmError on %s", async (_label, response) => {
    const { client } = stubClient(response);
    await expect(new ClaudeCaseGenerator(client, "m").generate({ language: "en", suspectCount: 3 })).rejects.toBeInstanceOf(LlmError);
  });
});
