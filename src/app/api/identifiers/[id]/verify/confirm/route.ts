import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { confirmVerification } from "@/lib/verification";

const Schema = z.object({
  verificationId: z.string().min(1),
  code: z.string().optional(),
  profileUrl: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await params; // identifier id is implied by the verificationId; kept in the URL for REST consistency
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const result = await confirmVerification(parsed.data);
  return NextResponse.json({ result });
}
