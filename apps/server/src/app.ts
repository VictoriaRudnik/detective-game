import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { Server } from "socket.io";
import type { EngineCtx } from "./engine/types";
import type { CaseGenerator, SuspectResponder } from "./llm/types";
import { RoomManager } from "./rooms/RoomManager";
import { createRoomEvents, registerSocketHandlers, type GameServer } from "./transport/socket";

export interface ServerOptions {
  port: number;
  host?: string;
  caseGenerator: CaseGenerator;
  suspectResponder: SuspectResponder;
}

export interface RunningServer {
  url: string;
  manager: RoomManager;
  close(): Promise<void>;
}

const systemCtx: EngineCtx = {
  now: () => Date.now(),
  newId: () => randomUUID(),
  random: () => Math.random(),
};

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const app = Fastify();
  app.get("/health", async () => ({ ok: true }));

  const io: GameServer = new Server(app.server);
  const manager = new RoomManager({
    caseGenerator: options.caseGenerator,
    suspectResponder: options.suspectResponder,
    events: createRoomEvents(io),
    ctx: systemCtx,
  });
  registerSocketHandlers(io, manager);

  const url = await app.listen({ port: options.port, host: options.host ?? "127.0.0.1" });
  return {
    url,
    manager,
    close: async () => {
      manager.dispose();
      io.disconnectSockets(true);
      await app.close();
    },
  };
}
