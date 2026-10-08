import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@game/shared";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Connects to the page's own origin; in development Vite proxies /socket.io to the game server. */
export function createSocket(): GameSocket {
  return io();
}
