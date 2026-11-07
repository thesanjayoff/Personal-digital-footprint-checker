import { NextRequest, NextResponse } from "next/server";
import { computeScore, scoreBand, scoreBandLabel } from "@/lib/scoring";
import { listAllFindings } from "@/lib/findings";
import { listRuns } from "@/lib/runs";

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner") ?? "me";
  const findings = listAllFindings(owner);
  const open = findings.filter((f) => f.status === "open");
  const breakdown = computeScore(open);
  const runs = listRuns(owner);
  return NextResponse.json({
    score: breakdown.score,
    band: scoreBand(breakdown.score),
    bandLabel: scoreBandLabel(breakdown.score),
    breakdown,
    history: runs.filter((r) => r.score !== null).map((r) => ({ at: r.started_at, score: r.score })),
  });
}
