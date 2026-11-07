import { NextRequest, NextResponse } from "next/server";
import { buildMarkdownReport } from "@/lib/report/markdown";
import { buildPdfReport } from "@/lib/report/pdf";

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner") ?? "me";
  const format = req.nextUrl.searchParams.get("format") ?? "markdown";

  if (format === "pdf") {
    const buffer = await buildPdfReport(owner);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="digital-footprint-report.pdf"`,
      },
    });
  }
  const markdown = buildMarkdownReport(owner);
  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="digital-footprint-report.md"`,
    },
  });
}
