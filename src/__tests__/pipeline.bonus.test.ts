import { describe, it, expect } from "vitest";
import { generate } from "../lib/pipeline";

describe("Bonus — a failed review must not hand off downstream", () => {
  it("skips advanceToNextStage when the draft never passes review", async () => {
    let handedOff = false;

    const res = await generate({
      behavior: "ok",
      advanceToNextStage: async () => {
        handedOff = true;
      },
      reviewPasses: () => false,
    });

    expect(res.status).toBe("error");
    expect(handedOff).toBe(false);
  });
});
