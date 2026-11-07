import { NextRequest, NextResponse } from "next/server";
import { scanFile, MAX_UPLOAD_BYTES } from "@/lib/metadata";
import { recordAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit` }, { status: 413 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const result = await scanFile(buf);
    recordAudit({ module: "metadata", action: "scan", details: { kind: result.kind, filenameLength: file.name.length } });
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not read file" }, { status: 400 });
  }
}
