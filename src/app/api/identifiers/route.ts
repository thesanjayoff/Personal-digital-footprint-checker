import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addIdentifier, listIdentifiers } from "@/lib/identifiers";

const CreateSchema = z.object({
  owner: z.string().default("me"),
  type: z.enum(["email", "username", "domain", "github"]),
  value: z.string().min(1).max(320),
});

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner") ?? "me";
  const identifiers = listIdentifiers(owner).map((i) => ({ ...i, value: i.verified_at ? i.value : i.value }));
  return NextResponse.json({ identifiers });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { owner, type, value } = parsed.data;
  const identifier = addIdentifier(owner, type, value.trim());
  return NextResponse.json({ identifier }, { status: 201 });
}
