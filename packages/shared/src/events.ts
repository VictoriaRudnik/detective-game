import { z } from "zod";
import { LanguageSchema, MAX_SUSPECTS, MIN_SUSPECTS } from "./case";
import type { GameErrorCode } from "./errors";
import type { PublicRoomView } from "./room";

const NameSchema = z.string().trim().min(1).max(24);
const PlayerIdSchema = z.string().min(1).max(64);
const RoomCodeSchema = z.string().trim().toUpperCase().length(6);

export const CreateRoomPayloadSchema = z.object({
  name: NameSchema,
  language: LanguageSchema,
  suspectCount: z.number().int().min(MIN_SUSPECTS).max(MAX_SUSPECTS),
  playerId: PlayerIdSchema.optional(),
});

export const JoinRoomPayloadSchema = z.object({
  roomId: RoomCodeSchema,
  name: NameSchema,
  playerId: PlayerIdSchema.optional(),
});

export const AskPayloadSchema = z.object({ suspectId: z.string(), text: z.string() });
export const ChatPayloadSchema = z.object({ text: z.string() });
export const CastVotePayloadSchema = z.object({ suspectId: z.string() });

export type CreateRoomPayload = z.input<typeof CreateRoomPayloadSchema>;
export type JoinRoomPayload = z.input<typeof JoinRoomPayloadSchema>;
export type AskPayload = z.input<typeof AskPayloadSchema>;
export type ChatPayload = z.input<typeof ChatPayloadSchema>;
export type CastVotePayload = z.input<typeof CastVotePayloadSchema>;

export type AckResult = { ok: true; roomId: string; playerId: string } | { ok: false; error: GameErrorCode };

export interface ClientToServerEvents {
  "room:create": (payload: CreateRoomPayload, ack: (result: AckResult) => void) => void;
  "room:join": (payload: JoinRoomPayload, ack: (result: AckResult) => void) => void;
  "game:start": () => void;
  ask: (payload: AskPayload) => void;
  chat: (payload: ChatPayload) => void;
  "vote:propose": () => void;
  "vote:cast": (payload: CastVotePayload) => void;
  "game:restart": () => void;
}

export interface ServerToClientEvents {
  "room:state": (view: PublicRoomView) => void;
  "answer:delta": (delta: { entryId: string; text: string }) => void;
  "game:error": (error: { code: GameErrorCode }) => void;
}
