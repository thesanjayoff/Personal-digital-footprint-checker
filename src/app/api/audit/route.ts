import { NextRequest, NextResponse } from "next/server";
import { listAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 300);
  return NextResponse.json({ entries: listAudit(limit) });
}
