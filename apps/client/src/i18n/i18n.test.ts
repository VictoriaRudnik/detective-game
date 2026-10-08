import { describe, expect, it } from "vitest";
import { GAME_ERROR_CODES, type SystemCode } from "@game/shared";
import en from "./en.json";
import ru from "./ru.json";

const SYSTEM_CODES: SystemCode[] = ["SUSPECT_SILENT", "VOTE_STARTED", "VOTE_TIED", "FORCED_VOTE"];

function keys(tree: object, prefix = ""): string[] {
  return Object.entries(tree)
    .flatMap(([key, value]) =>
      typeof value === "object" && value !== null ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
    )
    .sort();
}

describe("translations", () => {
  it("English and Russian have exactly the same keys", () => {
    expect(keys(ru)).toEqual(keys(en));
  });

  it("translate every error and system code", () => {
    const all = keys(en);
    for (const code of GAME_ERROR_CODES) expect(all).toContain(`errors.${code}`);
    for (const code of SYSTEM_CODES) expect(all).toContain(`system.${code}`);
  });
});
