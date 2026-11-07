import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setOptOutStatus } from "@/lib/brokerOptOuts";

const Schema = z.object({
  identifierId: z.string().min(1),
  status: z.enum(["not_started", "requested", "confirmed", "relisted"]),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ brokerId: string }> }) {
  const { brokerId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const record = setOptOutStatus(parsed.data.identifierId, brokerId, parsed.data.status, parsed.data.notes);
  return NextResponse.json({ record });
}
