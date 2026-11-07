import { NextRequest, NextResponse } from "next/server";
import { deleteTeamMemberData } from "@/lib/teamMembers";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteTeamMemberData(id);
  return NextResponse.json({ ok: true });
}
