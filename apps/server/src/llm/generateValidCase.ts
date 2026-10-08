import type { GeneratedCase } from "@game/shared";
import { validateCase } from "./caseValidator";
import { LlmError, type CaseGenerator, type CaseRequest } from "./types";

/** Asks the generator for a case until one passes validation, feeding the problems back each time. */
export async function generateValidCase(
  generator: CaseGenerator,
  req: CaseRequest,
  maxAttempts = 3,
): Promise<GeneratedCase> {
  let feedback: string[] = [];
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const candidate = await generator.generate(req, feedback);
      const problems = validateCase(candidate, req);
      if (problems.length === 0) return candidate;
      feedback = problems;
      lastError = new LlmError(`invalid case: ${problems.join("; ")}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw new LlmError(`case generation failed after ${maxAttempts} attempts`, { cause: lastError });
}
