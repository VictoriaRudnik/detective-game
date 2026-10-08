import type { Case, Language, PublicCase } from "./case";

export const MAX_TEXT_LENGTH = 500;

export function movesForSuspectCount(suspectCount: number): number {
  return 3 * suspectCount + 3;
}

export type Phase = "lobby" | "generating" | "investigating" | "voting" | "revealed";

export type SystemCode = "SUSPECT_SILENT" | "VOTE_STARTED" | "VOTE_TIED" | "FORCED_VOTE";

export interface Player {
  id: string;
  name: string;
  connected: boolean;
}

interface EntryBase {
  id: string;
  ts: number;
}

export type LogEntry =
  | (EntryBase & { kind: "question"; playerId: string; suspectId: string; text: string })
  | (EntryBase & { kind: "answer"; suspectId: string; text: string })
  | (EntryBase & { kind: "chat"; playerId: string; text: string })
  | (EntryBase & { kind: "system"; code: SystemCode });

/** One turn of a suspect's private conversation, as sent to the LLM. */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface Vote {
  initiatorId?: string;
  ballots: Record<string, string>;
  forced: boolean;
}

export interface GameResult {
  accusedId: string;
  correct: boolean;
}

export interface PendingAnswer {
  suspectId: string;
  entryId: string;
  question: string;
}

/** Full server-side room state. Never sent to clients as-is. */
export interface RoomState {
  id: string;
  hostId: string;
  language: Language;
  suspectCount: number;
  players: Player[];
  phase: Phase;
  case?: Case;
  movesLeft: number;
  turnPlayerId?: string;
  log: LogEntry[];
  suspectHistories: Record<string, ConversationTurn[]>;
  vote?: Vote;
  pendingAnswer?: PendingAnswer;
  result?: GameResult;
}

/** What every client in the room receives. */
export interface PublicRoomView {
  id: string;
  hostId: string;
  language: Language;
  suspectCount: number;
  players: Player[];
  phase: Phase;
  movesLeft: number;
  turnPlayerId?: string;
  log: LogEntry[];
  vote?: Vote;
  pendingAnswer?: Omit<PendingAnswer, "question">;
  result?: GameResult;
  case?: PublicCase;
  /** The full case, present only in phase "revealed". */
  reveal?: Case;
}
