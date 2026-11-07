import exifr from "exifr";

export interface ImageMetadataSummary {
  gps?: { latitude: number; longitude: number };
  deviceMake?: string;
  deviceModel?: string;
  software?: string;
  author?: string;
  createdAt?: string;
  raw: Record<string, unknown>;
}

export async function extractImageMetadata(buf: Buffer): Promise<ImageMetadataSummary> {
  const parsed = (await exifr.parse(buf, true).catch(() => null)) as Record<string, unknown> | null;
  if (!parsed) return { raw: {} };
  const gps =
    typeof parsed.latitude === "number" && typeof parsed.longitude === "number"
      ? { latitude: parsed.latitude, longitude: parsed.longitude }
      : undefined;
  return {
    gps,
    deviceMake: typeof parsed.Make === "string" ? parsed.Make : undefined,
    deviceModel: typeof parsed.Model === "string" ? parsed.Model : undefined,
    software: typeof parsed.Software === "string" ? parsed.Software : undefined,
    author: (parsed.Artist as string) ?? (parsed.Author as string) ?? (parsed.creator as string) ?? undefined,
    createdAt:
      parsed.DateTimeOriginal instanceof Date
        ? parsed.DateTimeOriginal.toISOString()
        : typeof parsed.DateTimeOriginal === "string"
          ? parsed.DateTimeOriginal
          : undefined,
    raw: parsed,
  };
}

/**
 * Strips JPEG APP1 (EXIF + XMP both live here) and APP13 (IPTC/Photoshop)
 * segments by walking the marker structure directly — lossless for the
 * actual image data, which starts at the SOS marker and is copied through
 * untouched. APP0/JFIF is kept (it's just format info, not personal data).
 */
export function stripJpegMetadata(buf: Buffer): Buffer {
  if (!(buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) {
    throw new Error("Not a JPEG file");
  }
  const out: number[] = [0xff, 0xd8]; // SOI
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      // Not aligned on a marker (shouldn't happen before SOS); copy the rest verbatim to be safe.
      for (let j = i; j < buf.length; j++) out.push(buf[j]);
      break;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      // Markers with no payload (shouldn't recur, but handle safely).
      out.push(0xff, marker);
      i += 2;
      continue;
    }
    if (marker === 0xda) {
      // Start of Scan: everything from here to EOI is compressed image data; copy through unchanged.
      for (let j = i; j < buf.length; j++) out.push(buf[j]);
      break;
    }
    const length = (buf[i + 2] << 8) | buf[i + 3];
    const segmentEnd = i + 2 + length;
    const isApp1 = marker === 0xe1;
    const isApp13 = marker === 0xed;
    const isComment = marker === 0xfe;
    if (!isApp1 && !isApp13 && !isComment) {
      for (let j = i; j < segmentEnd; j++) out.push(buf[j]);
    }
    i = segmentEnd;
  }
  return Buffer.from(out);
}

/**
 * Strips ancillary PNG chunks that can carry personal/device metadata
 * (tEXt, zTXt, iTXt, eXIf, tIME) while keeping every chunk that affects
 * how the image actually renders (IHDR, PLTE, IDAT, IEND, tRNS, gAMA,
 * cHRM, sRGB, pHYs, bKGD).
 */
export function stripPngMetadata(buf: Buffer): Buffer {
  const SIGNATURE = buf.subarray(0, 8);
  const DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
  const chunks: Buffer[] = [SIGNATURE];
  let i = 8;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString("latin1");
    const chunkEnd = i + 12 + len; // length(4) + type(4) + data(len) + crc(4)
    if (!DROP.has(type)) {
      chunks.push(buf.subarray(i, chunkEnd));
    }
    i = chunkEnd;
  }
  return Buffer.concat(chunks);
}

export function stripImageMetadata(kind: "jpeg" | "png", buf: Buffer): Buffer {
  return kind === "jpeg" ? stripJpegMetadata(buf) : stripPngMetadata(buf);
}
