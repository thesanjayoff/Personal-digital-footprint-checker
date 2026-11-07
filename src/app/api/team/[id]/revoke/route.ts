import { NextRequest, NextResponse } from "next/server";
import { revokeConsent } from "@/lib/teamMembers";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  revokeConsent(id);
  return NextResponse.json({ ok: true });
}
