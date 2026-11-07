import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setFindingStatus } from "@/lib/findings";

const Schema = z.object({ status: z.enum(["open", "done", "dismissed"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  setFindingStatus(id, parsed.data.status);
  return NextResponse.json({ ok: true });
}
