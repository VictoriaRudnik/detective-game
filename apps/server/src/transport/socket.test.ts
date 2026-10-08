import { afterEach, describe, expect, it, vi } from "vitest";
import { io as connect, type Socket } from "socket.io-client";
import type { AckResult, ClientToServerEvents, GameErrorCode, PublicRoomView, ServerToClientEvents } from "@game/shared";
import { startServer, type RunningServer } from "../app";
import { FakeCaseGenerator, FakeSuspectResponder } from "../llm/fakes";
import { LlmError } from "../llm/types";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

class TestClient {
  readonly socket: ClientSocket;
  readonly views: PublicRoomView[] = [];
  readonly deltas: string[] = [];
  readonly errors: GameErrorCode[] = [];
  playerId = "";

  constructor(url: string) {
    this.socket = connect(url, { transports: ["websocket"], forceNew: true });
    this.socket.on("room:state", (view) => this.views.push(view));
    this.socket.on("answer:delta", ({ text }) => this.deltas.push(text));
    this.socket.on("game:error", ({ code }) => this.errors.push(code));
  }

  get view(): PublicRoomView | undefined {
    return this.views.at(-1);
  }

  async create(name = "Anna"): Promise<string> {
    const result = await this.socket.emitWithAck("room:create", { name, language: "en", suspectCount: 3 });
    if (!result.ok) throw new Error(result.error);
    this.playerId = result.playerId;
    return result.roomId;
  }

  async join(roomId: string, name = "Boris", playerId?: string): Promise<AckResult> {
    const result = await this.socket.emitWithAck("room:join", { roomId, name, playerId });
    if (result.ok) this.playerId = result.playerId;
    return result;
  }

  waitFor(predicate: (view: PublicRoomView) => boolean): Promise<PublicRoomView> {
    return vi.waitFor(
      () => {
        const view = this.view;
        if (!view || !predicate(view)) throw new Error("state not reached yet");
        return view;
      },
      { timeout: 2000, interval: 10 },
    );
  }
}

let server: RunningServer;
let suspectResponder: FakeSuspectResponder;
const clients: TestClient[] = [];

async function boot(caseGenerator = new FakeCaseGenerator()) {
  suspectResponder = new FakeSuspectResponder();
  server = await startServer({ port: 0, caseGenerator, suspectResponder });
}

function client(): TestClient {
  const c = new TestClient(server.url);
  clients.push(c);
  return c;
}

async function startedRoom() {
  await boot();
  const host = client();
  const roomId = await host.create();
  host.socket.emit("game:start");
  await host.waitFor((v) => v.phase === "investigating");
  return { host, roomId };
}

afterEach(async () => {
  for (const c of clients.splice(0)) c.socket.disconnect();
  await server.close();
});

describe("socket transport", () => {
  it("plays a full game from lobby to reveal", async () => {
    await boot();
    const host = client();
    const guest = client();
    const roomId = await host.create();
    expect((await guest.join(roomId)).ok).toBe(true);
    await host.waitFor((v) => v.players.length === 2);

    guest.socket.emit("game:start");
    await vi.waitFor(() => expect(guest.errors).toContain("NOT_HOST"));

    host.socket.emit("game:start");
    const started = await guest.waitFor((v) => v.phase === "investigating");
    expect(started.turnPlayerId).toBe(host.playerId);
    expect(started.case?.suspects[0]).not.toHaveProperty("secret");
    expect(started.reveal).toBeUndefined();

    host.socket.emit("ask", { suspectId: "s2", text: "Where were you at ten?" });
    const answered = await guest.waitFor((v) => !v.pendingAnswer && v.log.some((e) => e.kind === "answer"));
    expect(answered.movesLeft).toBe(11);
    expect(answered.turnPlayerId).toBe(guest.playerId);
    expect(guest.deltas.join("")).toContain("Where were you at ten?");

    guest.socket.emit("vote:propose");
    await host.waitFor((v) => v.phase === "voting");
    host.socket.emit("vote:cast", { suspectId: "s1" });
    guest.socket.emit("vote:cast", { suspectId: "s1" });
    const revealed = await host.waitFor((v) => v.phase === "revealed");
    expect(revealed.result).toEqual({ accusedId: "s1", correct: true });
    expect(revealed.reveal?.solution.killerId).toBe("s1");
  });

  it("refunds the move when a suspect fails to answer", async () => {
    const { host } = await startedRoom();
    suspectResponder.failNext = 1;
    host.socket.emit("ask", { suspectId: "s2", text: "Hello?" });
    const view = await host.waitFor((v) => v.log.some((e) => e.kind === "system" && e.code === "SUSPECT_SILENT"));
    expect(view.movesLeft).toBe(12);
    expect(view.turnPlayerId).toBe(host.playerId);
  });

  it("returns to the lobby when the case cannot be generated", async () => {
    await boot(new FakeCaseGenerator({ results: [new LlmError("1"), new LlmError("2"), new LlmError("3")] }));
    const host = client();
    await host.create();
    host.socket.emit("game:start");
    await vi.waitFor(() => expect(host.errors).toContain("CASE_GENERATION_FAILED"));
    expect(host.view?.phase).toBe("lobby");
  });

  it("rejects bad payloads, unknown rooms and actions outside a room", async () => {
    await boot();
    const stranger = client();
    stranger.socket.emit("game:start");
    await vi.waitFor(() => expect(stranger.errors).toContain("NOT_IN_ROOM"));

    const invalid = await stranger.socket.emitWithAck("room:create", { name: "A", language: "en", suspectCount: 9 });
    expect(invalid).toEqual({ ok: false, error: "INVALID_PAYLOAD" });
    expect(await stranger.join("ZZZZZZ")).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
  });

  it("joins with a lower-case room code surrounded by spaces", async () => {
    await boot();
    const roomId = await client().create();
    const result = await client().join(` ${roomId.toLowerCase()} `);
    expect(result).toMatchObject({ ok: true, roomId });
  });

  it("restores a player who reconnects with their id", async () => {
    await boot();
    const host = client();
    const guest = client();
    const roomId = await host.create();
    await guest.join(roomId);
    guest.socket.disconnect();
    await host.waitFor((v) => v.players.some((p) => p.id === guest.playerId && !p.connected));

    await client().join(roomId, "Boris", guest.playerId);
    const view = await host.waitFor((v) => v.players.every((p) => p.connected));
    expect(view.players).toHaveLength(2);
  });

  it("ignores a stale socket's disconnect after the player reconnected", async () => {
    await boot();
    const host = client();
    const oldTab = client();
    const roomId = await host.create();
    await oldTab.join(roomId);

    const newTab = client();
    await newTab.join(roomId, "Boris", oldTab.playerId);
    oldTab.socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(host.view?.players.find((p) => p.id === oldTab.playerId)?.connected).toBe(true);
  });
});
