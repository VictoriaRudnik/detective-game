import type { CaseRequest } from "../types";
import { LANGUAGE_NAMES } from "./language";

export const CASE_SYSTEM_PROMPT =
  "You design murder mysteries for a cooperative party game. Players interrogate suspects who are each played by an AI " +
  "using the profile you write, and they win by naming the killer. A good case is fair: an attentive group can solve it " +
  "from what the innocent suspects know, and every suspect hides something, so nobody looks obviously innocent.";

export function buildCaseUserPrompt(req: CaseRequest, feedback: string[] = []): string {
  const ids = Array.from({ length: req.suspectCount }, (_, i) => `s${i + 1}`).join(", ");
  const lines = [
    `Create a new, original murder mystery with exactly ${req.suspectCount} suspects.`,
    "",
    "Work solution-first: decide the killer, the method, the motive and a precise timeline of the evening before you write the suspects, then build every suspect around that truth.",
    "",
    "Requirements:",
    `- Use the suspect ids ${ids}. Choose the killer freely among them; do not default to s1.`,
    "- Exactly one suspect is the killer (isKiller = true), and solution.killerId is that suspect's id.",
    "- The killer's alibi.claimed is a lie and differs from alibi.truth. Innocent suspects may bend the truth only to protect their own secret.",
    "- Every suspect has a secret that makes them look suspicious. Innocent suspects' secrets are red herrings unrelated to the murder.",
    "- solution.keyEvidence lists 2–4 facts that together point to the killer. Copy each of these facts word for word into the knows list of at least one innocent suspect. Never give a key evidence fact only to the killer.",
    "- knows holds 2–4 short facts per suspect that they will share when asked the right question.",
    "- publicDescription is one or two sentences everyone sees at the start; it must not reveal any secret.",
    "- persona.speechStyle describes how the suspect talks, so an actor can play them consistently.",
    "- briefing contains only facts the police know at the start.",
    `- Write every text field in ${LANGUAGE_NAMES[req.language]} and set language to "${req.language}".`,
  ];
  if (feedback.length > 0) {
    lines.push("", "Your previous attempt was rejected for these reasons. Fix all of them:", ...feedback.map((f) => `- ${f}`));
  }
  return lines.join("\n");
}
