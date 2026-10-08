import { startServer } from "./app";
import { loadEnv } from "./env";
import { createLlm } from "./llm/createLlm";

loadEnv();
const server = await startServer({ port: Number(process.env.PORT ?? 3001), ...createLlm(process.env) });
console.log(`Live Suspects server on ${server.url} (LLM: ${process.env.LLM_MODE === "fake" ? "fake" : "Claude"})`);
