import Anthropic from "@anthropic-ai/sdk";
import { parseArgs } from "node:util";
import { LanguageSchema, MAX_SUSPECTS, MIN_SUSPECTS } from "@game/shared";
import { loadEnv } from "../env";
import { ClaudeCaseGenerator } from "../llm/claude/ClaudeCaseGenerator";
import { DEFAULT_MODEL } from "../llm/claude/constants";
import { generateValidCase } from "../llm/generateValidCase";

loadEnv();

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    lang: { type: "string", default: "en" },
    suspects: { type: "string", default: "4" },
  },
});

const language = LanguageSchema.parse(values.lang);
const suspectCount = Number(values.suspects);
if (!Number.isInteger(suspectCount) || suspectCount < MIN_SUSPECTS || suspectCount > MAX_SUSPECTS) {
  console.error(`--suspects must be an integer from ${MIN_SUSPECTS} to ${MAX_SUSPECTS}`);
  process.exit(1);
}

const model = process.env.CASE_MODEL ?? DEFAULT_MODEL;
const generator = new ClaudeCaseGenerator(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }), model);
const startedAt = Date.now();
const generated = await generateValidCase(generator, { language, suspectCount });

console.log(JSON.stringify(generated, null, 2));
console.error(`Generated a ${language} case with ${suspectCount} suspects using ${model} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
