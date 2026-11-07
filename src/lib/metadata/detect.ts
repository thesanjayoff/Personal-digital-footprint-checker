export type FileKind = "jpeg" | "png" | "pdf" | "docx" | "xlsx" | "pptx" | "unknown";

/** Detects file type by magic bytes / internal structure — never trusts the filename or declared MIME type. */
export function detectFileKind(buf: Buffer): FileKind {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return "unknown"; // caller must peek inside the zip to tell docx/xlsx/pptx apart; see detectOfficeKind
  }
  return "unknown";
}

export async function detectOfficeKind(zip: { files: Record<string, unknown> }): Promise<"docx" | "xlsx" | "pptx" | "unknown"> {
  const names = Object.keys(zip.files);
  if (names.some((n) => n.startsWith("word/"))) return "docx";
  if (names.some((n) => n.startsWith("xl/"))) return "xlsx";
  if (names.some((n) => n.startsWith("ppt/"))) return "pptx";
  return "unknown";
}
