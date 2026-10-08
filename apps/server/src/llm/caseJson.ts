import { z } from "zod";
import { GeneratedCaseSchema, type GeneratedCase } from "@game/shared";
import { LlmError } from "./types";

/** The generated-case schema as plain JSON Schema, for providers that take one (the `$schema` dialect tag is dropped). */
export const { $schema: _dialect, ...CASE_JSON_SCHEMA } = z.toJSONSchema(GeneratedCaseSchema);

/** Parses a provider's raw JSON reply into a case, throwing LlmError when it is not valid JSON or not a case. */
export function parseCaseJson(text: string | null | undefined): GeneratedCase {
  if (!text) throw new LlmError("case generation returned no output");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new LlmError("case generation returned invalid JSON", { cause: error });
  }
  const parsed = GeneratedCaseSchema.safeParse(json);
  if (!parsed.success) throw new LlmError(`case does not match the schema: ${parsed.error.message}`);
  return parsed.data;
}
