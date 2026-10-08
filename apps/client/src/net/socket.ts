import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@game/shared";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Connects to VITE_SERVER_URL when the server is hosted separately (production on Vercel);
 * otherwise to the page's own origin, where in development Vite proxies /socket.io to the game server.
 */
export function createSocket(): GameSocket {
  const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
  return serverUrl ? io(serverUrl) : io();
}
