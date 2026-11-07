import { NextRequest, NextResponse } from "next/server";
import { listAllFindings, listOpenFindings } from "@/lib/findings";

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner") ?? "me";
  const status = req.nextUrl.searchParams.get("status");
  const findings = status === "open" ? listOpenFindings(owner) : listAllFindings(owner);
  return NextResponse.json({ findings });
}
