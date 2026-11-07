import { NextRequest, NextResponse } from "next/server";
import { importAccountsCsv } from "@/lib/accountInventory";
import { recordAudit } from "@/lib/audit";

const MAX_CSV_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const owner = (form?.get("owner") as string) || "me";
  const checkBreaches = form?.get("checkBreaches") === "true";
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "CSV too large" }, { status: 413 });
  }
  if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
    return NextResponse.json({ error: "Only .csv files are accepted" }, { status: 400 });
  }
  const text = await file.text();
  try {
    const summary = await importAccountsCsv(owner, text, checkBreaches);
    recordAudit({ module: "account_inventory", action: "csv_import", details: { owner, ...summary } });
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not parse CSV" }, { status: 400 });
  }
}
