import { describe, expect, it } from "vitest";
import { evalScenarios, runEvals } from "./evals";

// The eval suite runs in demo mode (no API key): search + template
// drafting over the seeded demo knowledge. Live-model evals need a
// real LLM_API_KEY and are deliberately not run here.
describe("eval suite (demo mode, seeded demo FAQ)", () => {
  it("has at least 8 scenarios including no-match and injection cases", () => {
    expect(evalScenarios.length).toBeGreaterThanOrEqual(8);
    expect(evalScenarios.some((s) => s.expectedSource === "")).toBe(true);
    expect(
      evalScenarios.some((s) => s.question.toLowerCase().includes("ignore your instructions")),
    ).toBe(true);
  });

  it("every scenario passes", async () => {
    const summary = await runEvals();
    const failures = summary.results.filter((r) => !r.passed);
    expect(
      failures.map((f) => `${f.question} → ${f.detail}`),
    ).toEqual([]);
    expect(summary.passed).toBe(summary.total);
    expect(summary.failed).toBe(0);
  });
});
