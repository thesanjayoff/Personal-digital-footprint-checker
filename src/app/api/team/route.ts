import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { inviteTeamMember, getAdminAggregateView } from "@/lib/teamMembers";

export async function GET() {
  return NextResponse.json({ members: getAdminAggregateView() });
}

const Schema = z.object({ displayName: z.string().min(1).max(200), email: z.string().email() });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const result = await inviteTeamMember(parsed.data.displayName, parsed.data.email);
  return NextResponse.json({ result }, { status: 201 });
}
