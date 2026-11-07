import { describe, expect, it } from "vitest";
import { computeScore, scoreBand, scoreBandLabel } from "@/lib/scoring";

describe("computeScore", () => {
  it("returns 100 for no findings", () => {
    expect(computeScore([]).score).toBe(100);
  });

  it("ignores resolved/dismissed findings", () => {
    const score = computeScore([
      { severity: "critical", status: "done" },
      { severity: "critical", status: "dismissed" },
    ]);
    expect(score.score).toBe(100);
  });

  it("subtracts weighted penalties per open severity", () => {
    const score = computeScore([{ severity: "high", status: "open" }]);
    expect(score.score).toBe(90); // 100 - 10
  });

  it("caps each severity tier's total contribution", () => {
    const manyLows = Array.from({ length: 50 }, () => ({ severity: "low" as const, status: "open" as const }));
    const score = computeScore(manyLows);
    expect(score.penaltyBySeverity.low).toBe(10); // capped, not 50
    expect(score.score).toBe(90);
  });

  it("never goes below 0 even when every severity tier is maxed out", () => {
    const everything = [
      ...Array.from({ length: 10 }, () => ({ severity: "critical" as const, status: "open" as const })),
      ...Array.from({ length: 10 }, () => ({ severity: "high" as const, status: "open" as const })),
      ...Array.from({ length: 10 }, () => ({ severity: "medium" as const, status: "open" as const })),
      ...Array.from({ length: 10 }, () => ({ severity: "low" as const, status: "open" as const })),
    ];
    const score = computeScore(everything);
    expect(score.score).toBe(0);
  });

  it("caps a single severity tier's contribution even with many findings in it alone", () => {
    const manyCriticals = Array.from({ length: 20 }, () => ({ severity: "critical" as const, status: "open" as const }));
    const score = computeScore(manyCriticals);
    expect(score.penaltyBySeverity.critical).toBe(60); // capped
    expect(score.score).toBe(40);
  });

  it("a single critical outweighs many lows", () => {
    const withCritical = computeScore([
      { severity: "critical", status: "open" },
      ...Array.from({ length: 5 }, () => ({ severity: "low" as const, status: "open" as const })),
    ]);
    const onlyLows = computeScore(Array.from({ length: 5 }, () => ({ severity: "low" as const, status: "open" as const })));
    expect(withCritical.score).toBeLessThan(onlyLows.score);
  });
});

describe("scoreBand / scoreBandLabel", () => {
  it("buckets scores into bands", () => {
    expect(scoreBand(10)).toBe("critical");
    expect(scoreBand(50)).toBe("high");
    expect(scoreBand(75)).toBe("medium");
    expect(scoreBand(95)).toBe("low");
  });

  it("returns a human label for each band", () => {
    expect(scoreBandLabel(10)).toMatch(/critical/i);
    expect(scoreBandLabel(95)).toMatch(/low/i);
  });
});
