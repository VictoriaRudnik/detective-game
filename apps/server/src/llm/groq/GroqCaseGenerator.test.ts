import type Groq from "groq-sdk";
import { describe, expect, it } from "vitest";
import { sampleCase } from "@game/shared/testing";
import { CASE_SYSTEM_PROMPT } from "../prompts/casePrompt";
import { LlmError } from "../types";
import { GroqCaseGenerator } from "./GroqCaseGenerator";

function stubClient(response: unknown) {
  const requests: Array<Record<string, unknown>> = [];
  const client = {
    chat: {
      completions: {
        create: async (params: Record<string, unknown>) => {
          requests.push(params);
          return response;
        },
      },
    },
  } as unknown as Groq;
  return { client, requests };
}

const reply = (content: string | null, finish_reason = "stop") => ({ choices: [{ finish_reason, message: { role: "assistant", content } }] });

describe("GroqCaseGenerator", () => {
  it("requests a case in strict JSON schema mode with high reasoning", async () => {
    const { client, requests } = stubClient(reply(JSON.stringify(sampleCase(3))));
    const generated = await new GroqCaseGenerator(client, "model-x").generate({ language: "en", suspectCount: 3 }, ["fix it"]);

    expect(generated).toEqual(sampleCase(3));
    expect(requests[0]).toMatchObject({
      model: "model-x",
      reasoning_effort: "high",
      response_format: { type: "json_schema", json_schema: { name: "murder_case", strict: true, schema: expect.objectContaining({ type: "object" }) } },
    });
    const schema = (requests[0]!.response_format as { json_schema: { schema: Record<string, unknown> } }).json_schema.schema;
    expect(schema).not.toHaveProperty("$schema");
    const messages = requests[0]!.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({ role: "system", content: CASE_SYSTEM_PROMPT });
    expect(messages[1]!.role).toBe("user");
    expect(messages[1]!.content).toContain("exactly 3 suspects");
    expect(messages[1]!.content).toContain("- fix it");
  });

  it.each([
    ["a truncated response", reply(JSON.stringify(sampleCase(3)), "length")],
    ["missing output", reply(null)],
    ["output that is not JSON", reply("Once upon a time")],
    ["JSON that is not a case", reply(JSON.stringify({ title: "x" }))],
  ])("throws LlmError on %s", async (_label, response) => {
    const { client } = stubClient(response);
    await expect(new GroqCaseGenerator(client, "m").generate({ language: "en", suspectCount: 3 })).rejects.toBeInstanceOf(LlmError);
  });
});
