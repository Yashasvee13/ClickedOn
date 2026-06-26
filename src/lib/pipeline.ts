import { extractJson } from "./extract-json";
import {
  mockStream,
  type MockBehavior,
  type MockState,
  type TransientError,
} from "./anthropic-mock";

export interface GenerateInput {
  /** Drives the mock streaming client (see anthropic-mock.ts). */
  behavior: MockBehavior;
  /** Hands the finished draft to the next pipeline stage. May reject. */
  advanceToNextStage: () => Promise<void>;
  /** Returns true once the draft passes review. Scripted by callers/tests. */
  reviewPasses: (attempt: number) => boolean;
}

export interface GenerateResult {
  status: "ok" | "error";
  attempts: number;
}

const MAX_REVISIONS = 3;
const MAX_STREAM_RETRIES = 5;

function isTransientError(err: unknown): boolean {
  return err instanceof Error && (err as TransientError).status === 429;
}

function isTruncatedJsonError(err: unknown): boolean {
  return err instanceof Error && err.message === "No fenced JSON block found";
}

async function streamDraft(
  behavior: MockBehavior,
  state: MockState,
): Promise<void> {
  for (let retry = 0; retry < MAX_STREAM_RETRIES; retry++) {
    try {
      const text = await mockStream(behavior, state);
      extractJson(text);
      return;
    } catch (err) {
      if (isTransientError(err) || isTruncatedJsonError(err)) {
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to stream draft after retries");
}

/**
 * Runs one content-generation pass: stream a draft, extract it, revise until it
 * passes review, then hand off to the next stage.
 *
 * This is a faithful (stripped-down) reproduction of the real pipeline — and it
 * ships with three real bugs from that pipeline. Your job is to fix them so the
 * test suite passes. See the README for the symptoms. (Do not edit the tests.)
 */
export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const state: MockState = { calls: 0 };

  try {
    await streamDraft(input.behavior, state);
  } catch {
    return { status: "error", attempts: 0 };
  }

  // Revise until the draft passes review.
  let attempt = 0;
  while (!input.reviewPasses(attempt) && attempt < MAX_REVISIONS) {
    attempt += 1;
  }

  if (!input.reviewPasses(attempt)) {
    return { status: "error", attempts: attempt };
  }

  try {
    await input.advanceToNextStage();
  } catch {
    return { status: "error", attempts: attempt };
  }

  return { status: "ok", attempts: attempt };
}

export { MAX_REVISIONS };
