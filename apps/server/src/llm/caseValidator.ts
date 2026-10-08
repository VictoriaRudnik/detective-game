import type { GeneratedCase } from "@game/shared";
import type { CaseRequest } from "./types";

const normalize = (text: string) => text.trim().toLowerCase();

/** Checks the game rules a generated case must satisfy. Returns human-readable problems; empty means valid. */
export function validateCase(c: GeneratedCase, req: CaseRequest): string[] {
  const errors: string[] = [];

  if (c.language !== req.language) {
    errors.push(`language must be "${req.language}", got "${c.language}"`);
  }
  if (c.suspects.length !== req.suspectCount) {
    errors.push(`expected ${req.suspectCount} suspects, got ${c.suspects.length}`);
  }

  const ids = c.suspects.map((s) => s.id);
  if (new Set(ids).size !== ids.length) {
    errors.push("suspect ids must be unique");
  }

  const killers = c.suspects.filter((s) => s.isKiller);
  if (killers.length !== 1) {
    errors.push(`exactly one suspect must have isKiller=true, got ${killers.length}`);
  }
  const killer = killers.length === 1 ? killers[0] : undefined;
  if (killer && killer.id !== c.solution.killerId) {
    errors.push(`solution.killerId "${c.solution.killerId}" does not match the killer "${killer.id}"`);
  }
  if (killer && normalize(killer.alibi.claimed) === normalize(killer.alibi.truth)) {
    errors.push("the killer's claimed alibi must differ from the truth");
  }

  if (c.solution.keyEvidence.length === 0) {
    errors.push("solution.keyEvidence must not be empty");
  }
  const innocentFacts = new Set(c.suspects.filter((s) => !s.isKiller).flatMap((s) => s.knows.map(normalize)));
  for (const evidence of c.solution.keyEvidence) {
    if (!innocentFacts.has(normalize(evidence))) {
      errors.push(`key evidence "${evidence}" must appear verbatim in the knows list of at least one innocent suspect`);
    }
  }

  if (c.briefing.evidence.length < 1 || c.briefing.evidence.length > 3) {
    errors.push(`briefing.evidence must list 1–3 clues, got ${c.briefing.evidence.length}`);
  }

  for (const path of blankTextPaths(c, "case")) {
    errors.push(`${path} must not be empty`);
  }
  return errors;
}

function blankTextPaths(value: unknown, path: string): string[] {
  if (typeof value === "string") return value.trim() === "" ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((item, i) => blankTextPaths(item, `${path}[${i}]`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => blankTextPaths(item, `${path}.${key}`));
  }
  return [];
}
