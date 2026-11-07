import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllModuleToggles, setSetting } from "@/lib/settings";
import { MODULES } from "@/lib/modules/registry";
import { isHibpConfigured } from "@/lib/hibp";

export async function GET() {
  return NextResponse.json({
    toggles: getAllModuleToggles(),
    modules: MODULES.map((m) => ({ id: m.id, name: m.name, description: m.description, dataSource: m.dataSource, termsUrl: m.termsUrl })),
    hibpConfigured: isHibpConfigured(),
  });
}

const Schema = z.object({ moduleId: z.string(), enabled: z.boolean() });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  setSetting(`module_enabled:${parsed.data.moduleId}`, parsed.data.enabled ? "true" : "false");
  return NextResponse.json({ ok: true });
}
