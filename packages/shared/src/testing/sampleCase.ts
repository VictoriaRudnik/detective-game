import type { GeneratedCase, Language, Suspect } from "../case";

const SUSPECTS: Suspect[] = [
  {
    id: "s1",
    name: "Margaret Hale",
    role: "the victim's wife",
    publicDescription: "Elegant and composed, married to Edmund for twenty years.",
    persona: { personality: "Cold, controlled, quietly calculating.", speechStyle: "Formal, clipped sentences; never raises her voice." },
    alibi: { claimed: "I was reading in the library all evening.", truth: "At 21:40 she slipped into the study and poured poison into Edmund's brandy." },
    secret: "She is drowning in gambling debts that Edmund refused to pay.",
    knows: ["Edmund drank his brandy alone in the study every night at ten."],
    isKiller: true,
  },
  {
    id: "s2",
    name: "Dr. Arthur Finch",
    role: "the family doctor",
    publicDescription: "A nervous physician who has treated the Hales for years.",
    persona: { personality: "Anxious, eager to please, easily flustered.", speechStyle: "Rambling, full of medical jargon and apologies." },
    alibi: { claimed: "I was playing cards in the drawing room.", truth: "He was playing cards in the drawing room with Thomas Reed." },
    secret: "He prescribed Edmund morphine without keeping any records.",
    knows: ["Margaret asked me last week which poisons cannot be tasted in brandy."],
    isKiller: false,
  },
  {
    id: "s3",
    name: "Lucy Grey",
    role: "the maid",
    publicDescription: "A young maid who sees everything and says little.",
    persona: { personality: "Observant, timid, loyal to the household.", speechStyle: "Short, polite answers; calls everyone sir or madam." },
    alibi: { claimed: "I was polishing silver in the kitchen.", truth: "She left the kitchen to meet Henry Cole by the back door." },
    secret: "She is secretly engaged to the gardener against the house rules.",
    knows: ["I saw Margaret leave the library at 21:40 and walk towards the study."],
    isKiller: false,
  },
  {
    id: "s4",
    name: "Thomas Reed",
    role: "the victim's business partner",
    publicDescription: "A loud, confident man who co-owns the Hale shipping company.",
    persona: { personality: "Boastful, impatient, defensive when cornered.", speechStyle: "Loud, uses business slang, interrupts." },
    alibi: { claimed: "I was playing cards with the doctor.", truth: "He was playing cards with the doctor in the drawing room." },
    secret: "He has been embezzling money from the company.",
    knows: ["Edmund told me he was changing his will to leave Margaret nothing."],
    isKiller: false,
  },
  {
    id: "s5",
    name: "Henry Cole",
    role: "the gardener",
    publicDescription: "A quiet gardener who was not supposed to be in the house that night.",
    persona: { personality: "Gruff, honest, uncomfortable indoors.", speechStyle: "Few words, rural expressions." },
    alibi: { claimed: "I was in my cottage all night.", truth: "He came to the back door to meet Lucy." },
    secret: "He entered the manor without permission to see Lucy.",
    knows: ["The library lamp went dark at 21:35 and was lit again at 22:00."],
    isKiller: false,
  },
];

/** A small, valid case for tests and the fake LLM. The killer is always "s1". */
export function sampleCase(suspectCount = 4, language: Language = "en"): GeneratedCase {
  if (suspectCount < 1 || suspectCount > SUSPECTS.length) {
    throw new RangeError(`sampleCase supports 1–${SUSPECTS.length} suspects, got ${suspectCount}`);
  }
  // Deep copy so callers can mutate the result; `structuredClone` is not in the ES-only lib.
  const suspects: Suspect[] = JSON.parse(JSON.stringify(SUSPECTS.slice(0, suspectCount)));
  return {
    title: "Death at Blackmoor Manor",
    language,
    briefing: {
      victim: "Lord Edmund Hale, 58, shipping magnate",
      location: "The study of Blackmoor Manor",
      timeOfDeath: "Around 22:15",
      causeOfDeath: "Poisoning",
      setting: "A stormy autumn night; the roads were flooded and nobody could leave the manor.",
      evidence: [
        "A half-empty brandy glass on the desk smells faintly of bitter almonds.",
        "The study door was locked from the inside with the key in the lock; only the family keep a spare.",
        "A damp lace handkerchief was found under the desk.",
      ],
    },
    solution: {
      killerId: "s1",
      method: "Poison poured into his evening brandy",
      motive: "Edmund refused to pay her gambling debts and was about to cut her out of his will.",
      keyEvidence: suspects.filter((s) => !s.isKiller).map((s) => s.knows[0]!),
    },
    suspects,
  };
}
