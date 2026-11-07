import { NextRequest, NextResponse } from "next/server";
import { startVerification } from "@/lib/verification";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await startVerification(id);
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to start verification" }, { status: 400 });
  }
}
