import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  AskPayloadSchema,
  CastVotePayloadSchema,
  ChatPayloadSchema,
  CreateRoomPayloadSchema,
  JoinRoomPayloadSchema,
  type AckResult,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@game/shared";
import type { Action } from "../engine/actions";
import type { RoomEvents, RoomManager } from "../rooms/RoomManager";

interface SocketData {
  roomId?: string;
  playerId?: string;
}
type InterServerEvents = Record<string, never>;

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function createRoomEvents(io: GameServer): RoomEvents {
  return {
    state: (roomId, view) => io.to(roomId).emit("room:state", view),
    answerDelta: (roomId, entryId, text) => io.to(roomId).emit("answer:delta", { entryId, text }),
    error: (roomId, code) => io.to(roomId).emit("game:error", { code }),
  };
}

export function registerSocketHandlers(
  io: GameServer,
  manager: RoomManager,
  newPlayerId: () => string = randomUUID,
): void {
  // A reloaded page connects a new socket before the old one's disconnect arrives.
  // Only the player's newest socket may mark them offline.
  const activeSocketByPlayer = new Map<string, string>();

  io.on("connection", (socket: GameSocket) => {
    const leaveCurrentRoom = () => {
      const { roomId, playerId } = socket.data;
      if (!roomId || !playerId) return;
      void socket.leave(roomId);
      socket.data = {};
      if (activeSocketByPlayer.get(playerId) === socket.id) {
        activeSocketByPlayer.delete(playerId);
        manager.dispatch(roomId, { type: "disconnect", playerId });
      }
    };

    const enterRoom = (roomId: string, playerId: string) => {
      if (socket.data.roomId !== roomId || socket.data.playerId !== playerId) leaveCurrentRoom();
      socket.data = { roomId, playerId };
      activeSocketByPlayer.set(playerId, socket.id);
      void socket.join(roomId);
    };

    const act = (build: (playerId: string) => Action | undefined) => {
      const { roomId, playerId } = socket.data;
      if (!roomId || !playerId) return void socket.emit("game:error", { code: "NOT_IN_ROOM" });
      const action = build(playerId);
      if (!action) return void socket.emit("game:error", { code: "INVALID_PAYLOAD" });
      const error = manager.dispatch(roomId, action);
      if (error) socket.emit("game:error", { code: error });
    };

    socket.on("room:create", (raw, ack) => {
      const parsed = CreateRoomPayloadSchema.safeParse(raw);
      if (!parsed.success) return reply(ack, { ok: false, error: "INVALID_PAYLOAD" });
      const { name, language, suspectCount } = parsed.data;
      const playerId = parsed.data.playerId ?? newPlayerId();
      const roomId = manager.createRoom({ playerId, name, language, suspectCount });
      enterRoom(roomId, playerId);
      reply(ack, { ok: true, roomId, playerId });
      const view = manager.getView(roomId);
      if (view) socket.emit("room:state", view);
    });

    socket.on("room:join", (raw, ack) => {
      const parsed = JoinRoomPayloadSchema.safeParse(raw);
      if (!parsed.success) return reply(ack, { ok: false, error: "INVALID_PAYLOAD" });
      const { roomId, name } = parsed.data;
      if (!manager.hasRoom(roomId)) return reply(ack, { ok: false, error: "ROOM_NOT_FOUND" });
      const playerId = parsed.data.playerId ?? newPlayerId();
      enterRoom(roomId, playerId);
      reply(ack, { ok: true, roomId, playerId });
      manager.dispatch(roomId, { type: "join", playerId, name });
    });

    socket.on("game:start", () => act((playerId) => ({ type: "start", playerId })));
    socket.on("game:restart", () => act((playerId) => ({ type: "restart", playerId })));
    socket.on("vote:propose", () => act((playerId) => ({ type: "proposeVote", playerId })));

    socket.on("ask", (raw) =>
      act((playerId) => {
        const parsed = AskPayloadSchema.safeParse(raw);
        return parsed.success ? { type: "ask", playerId, suspectId: parsed.data.suspectId, text: parsed.data.text } : undefined;
      }),
    );
    socket.on("chat", (raw) =>
      act((playerId) => {
        const parsed = ChatPayloadSchema.safeParse(raw);
        return parsed.success ? { type: "chat", playerId, text: parsed.data.text } : undefined;
      }),
    );
    socket.on("vote:cast", (raw) =>
      act((playerId) => {
        const parsed = CastVotePayloadSchema.safeParse(raw);
        return parsed.success ? { type: "castVote", playerId, suspectId: parsed.data.suspectId } : undefined;
      }),
    );

    socket.on("disconnect", leaveCurrentRoom);
  });
}

/** Clients may omit the acknowledgement callback; never crash on that. */
function reply(ack: unknown, result: AckResult): void {
  if (typeof ack === "function") ack(result);
}
