import { describe, expect, it } from "vitest";
import type { Case } from "@game/shared";
import { sampleCase } from "@game/shared/testing";
import { buildSuspectSystemPrompt } from "./suspectPrompt";

const theCase: Case = { ...sampleCase(4, "ru"), id: "c1" };
const [killer, doctor, maid] = theCase.suspects as [Case["suspects"][0], Case["suspects"][0], Case["suspects"][0]];

describe("buildSuspectSystemPrompt", () => {
  it("contains the suspect's own private profile", () => {
    const prompt = buildSuspectSystemPrompt(theCase, doctor);
    expect(prompt).toContain("You are Dr. Arthur Finch, the family doctor");
    expect(prompt).toContain(doctor.secret);
    expect(prompt).toContain(doctor.alibi.claimed);
    expect(prompt).toContain(doctor.alibi.truth);
    expect(prompt).toContain(doctor.knows[0]);
    expect(prompt).toContain(theCase.briefing.victim);
  });

  it("answers in the case language", () => {
    expect(buildSuspectSystemPrompt(theCase, doctor)).toContain("Answer in Russian only.");
  });

  it("gives killer rules only to the killer", () => {
    expect(buildSuspectSystemPrompt(theCase, killer)).toContain("You are the killer");
    expect(buildSuspectSystemPrompt(theCase, doctor)).toContain("You are innocent");
    expect(buildSuspectSystemPrompt(theCase, doctor)).not.toContain("You are the killer");
  });

  it("names the other suspects without their secrets", () => {
    const prompt = buildSuspectSystemPrompt(theCase, doctor);
    expect(prompt).toContain(maid.name);
    expect(prompt).not.toContain(maid.secret);
    expect(prompt).not.toContain(maid.knows[0]);
    expect(prompt).not.toContain(killer.alibi.truth);
  });

  it("is deterministic so it can be prompt-cached", () => {
    expect(buildSuspectSystemPrompt(theCase, doctor)).toBe(buildSuspectSystemPrompt(structuredClone(theCase), doctor));
  });
});
