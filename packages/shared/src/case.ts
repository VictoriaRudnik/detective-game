import { z } from "zod";

export const LANGUAGES = ["en", "ru"] as const;
export const LanguageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof LanguageSchema>;

export const MIN_SUSPECTS = 3;
export const MAX_SUSPECTS = 5;

export const BriefingSchema = z.object({
  victim: z.string(),
  location: z.string(),
  timeOfDeath: z.string(),
  causeOfDeath: z.string(),
  setting: z.string(),
  /** Physical clues the police found, visible to everyone from the start. */
  evidence: z.array(z.string()),
});

export const SuspectSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  publicDescription: z.string(),
  persona: z.object({ personality: z.string(), speechStyle: z.string() }),
  alibi: z.object({ claimed: z.string(), truth: z.string() }),
  secret: z.string(),
  knows: z.array(z.string()),
  isKiller: z.boolean(),
});

export const SolutionSchema = z.object({
  killerId: z.string(),
  method: z.string(),
  motive: z.string(),
  keyEvidence: z.array(z.string()),
});

/**
 * The shape Claude generates. Deliberately free of min/max constraints: the
 * game rules live in the server's case validator, which can explain failures.
 * `solution` comes before `suspects` so the model decides the truth first.
 */
export const GeneratedCaseSchema = z.object({
  title: z.string(),
  language: LanguageSchema,
  briefing: BriefingSchema,
  solution: SolutionSchema,
  suspects: z.array(SuspectSchema),
});

export const CaseSchema = GeneratedCaseSchema.extend({ id: z.string() });

export type Briefing = z.infer<typeof BriefingSchema>;
export type Suspect = z.infer<typeof SuspectSchema>;
export type Solution = z.infer<typeof SolutionSchema>;
export type GeneratedCase = z.infer<typeof GeneratedCaseSchema>;
export type Case = z.infer<typeof CaseSchema>;

export type PublicSuspect = Pick<Suspect, "id" | "name" | "role" | "publicDescription">;

export interface PublicCase {
  title: string;
  language: Language;
  briefing: Briefing;
  suspects: PublicSuspect[];
}

export function toPublicCase(c: Case): PublicCase {
  return {
    title: c.title,
    language: c.language,
    briefing: c.briefing,
    suspects: c.suspects.map(({ id, name, role, publicDescription }) => ({ id, name, role, publicDescription })),
  };
}
