import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setAccountStatus } from "@/lib/accountInventory";

const Schema = z.object({ status: z.enum(["active", "to_delete", "deleted"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  setAccountStatus(id, parsed.data.status);
  return NextResponse.json({ ok: true });
}
