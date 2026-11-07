import { NextRequest, NextResponse } from "next/server";
import { cleanFile, MAX_UPLOAD_BYTES } from "@/lib/metadata";
import { recordAudit } from "@/lib/audit";

const CONTENT_TYPES: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

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
    const { kind, cleaned } = await cleanFile(buf);
    recordAudit({ module: "metadata", action: "clean", details: { kind } });
    return new NextResponse(new Uint8Array(cleaned), {
      headers: {
        "Content-Type": CONTENT_TYPES[kind],
        "Content-Disposition": `attachment; filename="clean-${file.name}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not clean file" }, { status: 400 });
  }
}
