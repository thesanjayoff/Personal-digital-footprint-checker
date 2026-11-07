import { NextRequest, NextResponse } from "next/server";
import { getPrioritizedChecklist } from "@/lib/checklist";

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner") ?? "me";
  return NextResponse.json({ checklist: getPrioritizedChecklist(owner) });
}
