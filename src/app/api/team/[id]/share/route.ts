import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setShareWithAdmin } from "@/lib/teamMembers";

const Schema = z.object({ share: z.boolean() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  setShareWithAdmin(id, parsed.data.share);
  return NextResponse.json({ ok: true });
}
