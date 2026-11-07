import { NextRequest, NextResponse } from "next/server";
import { deleteAllDataFor } from "@/lib/dataDeletion";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const owner = body?.owner ?? "me";
  deleteAllDataFor(owner);
  return NextResponse.json({ ok: true });
}
