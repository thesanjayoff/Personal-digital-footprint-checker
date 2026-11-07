import { NextRequest, NextResponse } from "next/server";
import { runAllChecks } from "@/lib/runEngine";
import { listRuns } from "@/lib/runs";

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner") ?? "me";
  return NextResponse.json({ runs: listRuns(owner) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const owner = body?.owner ?? "me";
  const outcome = await runAllChecks(owner, "manual");
  return NextResponse.json({ outcome });
}
