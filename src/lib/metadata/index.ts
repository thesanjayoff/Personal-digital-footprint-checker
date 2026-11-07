import JSZip from "jszip";
import { detectFileKind, detectOfficeKind, type FileKind } from "./detect";
import { extractImageMetadata, stripImageMetadata } from "./image";
import { extractPdfMetadata, stripPdfMetadata } from "./pdf";
import { extractOfficeMetadata, stripOfficeMetadata } from "./office";

export type ResolvedKind = "jpeg" | "png" | "pdf" | "docx" | "xlsx" | "pptx";

export interface ScanResult {
  kind: ResolvedKind;
  summary: Record<string, unknown>;
  hasAnyMetadata: boolean;
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function resolveKind(buf: Buffer): Promise<ResolvedKind | "unsupported"> {
  const kind: FileKind = detectFileKind(buf);
  if (kind === "jpeg" || kind === "png" || kind === "pdf") return kind;
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) {
    try {
      const zip = await JSZip.loadAsync(buf);
      const officeKind = await detectOfficeKind(zip);
      if (officeKind !== "unknown") return officeKind;
    } catch {
      // not a valid zip after all
    }
  }
  return "unsupported";
}

export async function scanFile(buf: Buffer): Promise<ScanResult> {
  const kind = await resolveKind(buf);
  if (kind === "unsupported") throw new Error("Unsupported or unrecognized file type");

  if (kind === "jpeg" || kind === "png") {
    const summary = await extractImageMetadata(buf);
    const hasAnyMetadata = !!(summary.gps || summary.deviceMake || summary.deviceModel || summary.software || summary.author || summary.createdAt);
    return { kind, summary: summary as unknown as Record<string, unknown>, hasAnyMetadata };
  }
  if (kind === "pdf") {
    const summary = await extractPdfMetadata(buf);
    const hasAnyMetadata = Object.values(summary).some(Boolean);
    return { kind, summary: summary as unknown as Record<string, unknown>, hasAnyMetadata };
  }
  const summary = await extractOfficeMetadata(buf);
  const hasAnyMetadata = Object.values(summary).some((v) => (typeof v === "boolean" ? v : Boolean(v)));
  return { kind, summary: summary as unknown as Record<string, unknown>, hasAnyMetadata };
}

export async function cleanFile(buf: Buffer): Promise<{ kind: ResolvedKind; cleaned: Buffer }> {
  const kind = await resolveKind(buf);
  if (kind === "unsupported") throw new Error("Unsupported or unrecognized file type");
  if (kind === "jpeg" || kind === "png") return { kind, cleaned: stripImageMetadata(kind, buf) };
  if (kind === "pdf") return { kind, cleaned: await stripPdfMetadata(buf) };
  return { kind, cleaned: await stripOfficeMetadata(buf) };
}
