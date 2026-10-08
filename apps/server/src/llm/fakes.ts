import type { GeneratedCase } from "@game/shared";
import { sampleCase } from "@game/shared/testing";
import { LlmError, type AnswerRequest, type CaseGenerator, type CaseRequest, type SuspectResponder } from "./types";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Returns queued results in order, then the sample case. Used by tests and LLM_MODE=fake. */
export class FakeCaseGenerator implements CaseGenerator {
  readonly calls: Array<{ req: CaseRequest; feedback: string[] }> = [];
  private readonly queue: Array<GeneratedCase | Error>;
  private readonly delayMs: number;

  constructor(options: { results?: Array<GeneratedCase | Error>; delayMs?: number } = {}) {
    this.queue = [...(options.results ?? [])];
    this.delayMs = options.delayMs ?? 0;
  }

  async generate(req: CaseRequest, feedback: string[] = []): Promise<GeneratedCase> {
    this.calls.push({ req, feedback });
    if (this.delayMs > 0) await sleep(this.delayMs);
    const next = this.queue.shift();
    if (next instanceof Error) throw next;
    return next ?? sampleCase(req.suspectCount, req.language);
  }
}

/** Answers with a canned sentence streamed word by word. Set `failNext` to make the next calls throw. */
export class FakeSuspectResponder implements SuspectResponder {
  readonly calls: AnswerRequest[] = [];
  failNext = 0;

  constructor(private readonly options: { chunkDelayMs?: number } = {}) {}

  async answer(req: AnswerRequest, onDelta: (text: string) => void): Promise<string> {
    this.calls.push(structuredClone(req));
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new LlmError("fake suspect failure");
    }
    const text = `${req.suspect.name}: I know nothing about "${req.question}".`;
    for (const chunk of text.split(/(?<= )/)) {
      if (this.options.chunkDelayMs) await sleep(this.options.chunkDelayMs);
      onDelta(chunk);
    }
    return text;
  }
}
