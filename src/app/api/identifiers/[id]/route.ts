import { NextRequest, NextResponse } from "next/server";
import { deleteIdentifier, getIdentifier } from "@/lib/identifiers";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const identifier = getIdentifier(id);
  if (!identifier) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ identifier });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteIdentifier(id);
  return NextResponse.json({ ok: true });
}
