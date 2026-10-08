import type { Case, ConversationTurn, GeneratedCase, Language, Suspect } from "@game/shared";

export interface CaseRequest {
  language: Language;
  suspectCount: number;
}

export interface CaseGenerator {
  /** Generates one candidate case. `feedback` lists problems with the previous attempt. Throws on failure. */
  generate(req: CaseRequest, feedback?: string[]): Promise<GeneratedCase>;
}

export interface AnswerRequest {
  case: Case;
  suspect: Suspect;
  /** Earlier questions to this suspect and their answers, oldest first. */
  history: ConversationTurn[];
  question: string;
}

export interface SuspectResponder {
  /** Streams the in-character answer through `onDelta` and resolves with the full text. Throws on failure. */
  answer(req: AnswerRequest, onDelta: (text: string) => void): Promise<string>;
}

export class LlmError extends Error {
  override name = "LlmError";
}
