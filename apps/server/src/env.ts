import { existsSync } from "node:fs";

/** Loads `.env` from the current directory when it exists (Node's built-in loader, no dependency). */
export function loadEnv(path = ".env"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
