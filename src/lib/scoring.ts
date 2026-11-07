import type { Severity } from "./modules/types";

interface ScorableFinding {
  severity: Severity;
  status: "open" | "done" | "dismissed";
}

/** Per-occurrence penalty and the max total penalty that severity tier can contribute. */
const WEIGHTS: Record<Severity, { per: number; cap: number }> = {
  critical: { per: 20, cap: 60 },
  high: { per: 10, cap: 40 },
  medium: { per: 4, cap: 25 },
  low: { per: 1, cap: 10 },
  info: { per: 0, cap: 0 },
};

export interface ScoreBreakdown {
  score: number;
  penaltyBySeverity: Record<Severity, number>;
  totalPenalty: number;
  openCounts: Record<Severity, number>;
}

/**
 * Pure, deterministic exposure score. Only "open" findings count — fixing
 * or correctly dismissing something improves the score immediately. Each
 * severity tier's contribution is capped so, say, fifty "low" findings
 * can't swamp a single "critical" the way an uncapped sum would.
 */
export function computeScore(findings: ScorableFinding[]): ScoreBreakdown {
  const openCounts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    if (f.status === "open") openCounts[f.severity]++;
  }
  const penaltyBySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let totalPenalty = 0;
  for (const sev of Object.keys(WEIGHTS) as Severity[]) {
    const { per, cap } = WEIGHTS[sev];
    const penalty = Math.min(cap, per * openCounts[sev]);
    penaltyBySeverity[sev] = penalty;
    totalPenalty += penalty;
  }
  const score = Math.max(0, Math.round(100 - Math.min(100, totalPenalty)));
  return { score, penaltyBySeverity, totalPenalty, openCounts };
}

export type ScoreBand = "critical" | "high" | "medium" | "low";

export function scoreBand(score: number): ScoreBand {
  if (score < 40) return "critical";
  if (score < 65) return "high";
  if (score < 85) return "medium";
  return "low";
}

export function scoreBandLabel(score: number): string {
  const band = scoreBand(score);
  return (
    {
      critical: "Critical exposure",
      high: "High exposure",
      medium: "Moderate exposure",
      low: "Low exposure",
    } as const
  )[band];
}
