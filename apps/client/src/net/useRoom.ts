import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AckResult, GameErrorCode, Language, PublicRoomView } from "@game/shared";
import { roomPath } from "./roomPath";
import { session } from "./session";
import { createSocket, type GameSocket } from "./socket";

export interface RoomActions {
  create(settings: { name: string; language: Language; suspectCount: number }): Promise<GameErrorCode | undefined>;
  join(roomId: string, name: string): Promise<GameErrorCode | undefined>;
  start(): void;
  ask(suspectId: string, text: string): void;
  chat(text: string): void;
  proposeVote(): void;
  castVote(suspectId: string): void;
  restart(): void;
}

export interface RoomSession {
  view?: PublicRoomView;
  playerId?: string;
  /** Streamed text of the answer currently being written, keyed by log entry id. */
  deltas: Record<string, string>;
  error?: GameErrorCode;
  connected: boolean;
  dismissError(): void;
  actions: RoomActions;
}

/** Streamed text matters only while an answer is pending; finished answers come from the log. */
export function keepPendingDelta(deltas: Record<string, string>, view: PublicRoomView): Record<string, string> {
  const entryId = view.pendingAnswer?.entryId;
  return entryId ? { [entryId]: deltas[entryId] ?? "" } : {};
}

interface Membership {
  roomId: string;
  name: string;
  playerId: string;
}

export function useRoom(): RoomSession {
  const socketRef = useRef<GameSocket | null>(null);
  const membershipRef = useRef<Membership | null>(null);
  const [view, setView] = useState<PublicRoomView>();
  const [playerId, setPlayerId] = useState<string>();
  const [deltas, setDeltas] = useState<Record<string, string>>({});
  const [error, setError] = useState<GameErrorCode>();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // After a dropped connection, put the player back into their room.
      const membership = membershipRef.current;
      if (!membership) return;
      socket.emit("room:join", membership, (result) => {
        if (result.ok) return;
        membershipRef.current = null;
        setView(undefined);
        setError(result.error);
        window.history.replaceState(null, "", "/");
      });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("room:state", (next) => {
      setView(next);
      setDeltas((current) => keepPendingDelta(current, next));
    });
    socket.on("answer:delta", ({ entryId, text }) =>
      setDeltas((current) => ({ ...current, [entryId]: (current[entryId] ?? "") + text })),
    );
    socket.on("game:error", ({ code }) => setError(code));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const enter = useCallback((result: AckResult, name: string): GameErrorCode | undefined => {
    if (!result.ok) {
      setError(result.error);
      return result.error;
    }
    membershipRef.current = { roomId: result.roomId, name, playerId: result.playerId };
    session.setPlayerId(result.playerId);
    session.setName(name);
    setPlayerId(result.playerId);
    window.history.replaceState(null, "", roomPath(result.roomId));
    return undefined;
  }, []);

  const actions = useMemo<RoomActions>(
    () => ({
      async create(settings) {
        const socket = socketRef.current;
        if (!socket) return "NOT_IN_ROOM";
        return enter(await socket.emitWithAck("room:create", { ...settings, playerId: session.playerId() }), settings.name);
      },
      async join(roomId, name) {
        const socket = socketRef.current;
        if (!socket) return "NOT_IN_ROOM";
        return enter(await socket.emitWithAck("room:join", { roomId, name, playerId: session.playerId() }), name);
      },
      start: () => socketRef.current?.emit("game:start"),
      ask: (suspectId, text) => socketRef.current?.emit("ask", { suspectId, text }),
      chat: (text) => socketRef.current?.emit("chat", { text }),
      proposeVote: () => socketRef.current?.emit("vote:propose"),
      castVote: (suspectId) => socketRef.current?.emit("vote:cast", { suspectId }),
      restart: () => socketRef.current?.emit("game:restart"),
    }),
    [enter],
  );

  const dismissError = useCallback(() => setError(undefined), []);

  return { view, playerId, deltas, error, connected, dismissError, actions };
}
