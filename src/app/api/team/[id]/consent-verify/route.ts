import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { confirmVerification } from "@/lib/verification";
import { markConsented } from "@/lib/teamMembers";

const Schema = z.object({ verificationId: z.string().min(1), code: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const result = await confirmVerification(parsed.data);
  if (result.verified) markConsented(id);
  return NextResponse.json({ result });
}
