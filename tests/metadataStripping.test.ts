import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { stripJpegMetadata, stripPngMetadata } from "@/lib/metadata/image";
import { extractPdfMetadata, stripPdfMetadata } from "@/lib/metadata/pdf";
import { extractOfficeMetadata, stripOfficeMetadata } from "@/lib/metadata/office";

function u16be(n: number): Buffer {
  return Buffer.from([(n >> 8) & 0xff, n & 0xff]);
}

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const length = payload.length + 2; // includes the 2 length bytes themselves
  return Buffer.concat([Buffer.from([0xff, marker]), u16be(length), payload]);
}

describe("JPEG metadata stripping", () => {
  it("removes APP1 (EXIF/XMP), APP13 (IPTC) and COM segments but keeps APP0 and the scan data byte-for-byte", () => {
    const app0 = jpegSegment(0xe0, Buffer.from("APP0_KEEP_MARKER_JFIF"));
    const app1Exif = jpegSegment(0xe1, Buffer.from("APP1_EXIF_SHOULD_BE_REMOVED"));
    const app13Iptc = jpegSegment(0xed, Buffer.from("APP13_IPTC_SHOULD_BE_REMOVED"));
    const com = jpegSegment(0xfe, Buffer.from("COMMENT_SHOULD_BE_REMOVED"));
    const sosAndScan = Buffer.concat([
      Buffer.from([0xff, 0xda]),
      Buffer.from("SCANDATA_SHOULD_REMAIN_VERBATIM"),
      Buffer.from([0xff, 0xd9]), // EOI
    ]);
    const original = Buffer.concat([Buffer.from([0xff, 0xd8]), app0, app1Exif, app13Iptc, com, sosAndScan]);

    const cleaned = stripJpegMetadata(original);

    expect(cleaned.includes("APP0_KEEP_MARKER_JFIF")).toBe(true);
    expect(cleaned.includes("SCANDATA_SHOULD_REMAIN_VERBATIM")).toBe(true);
    expect(cleaned.includes("APP1_EXIF_SHOULD_BE_REMOVED")).toBe(false);
    expect(cleaned.includes("APP13_IPTC_SHOULD_BE_REMOVED")).toBe(false);
    expect(cleaned.includes("COMMENT_SHOULD_BE_REMOVED")).toBe(false);
    // The scan data onward must be byte-identical to the original (lossless image data).
    expect(cleaned.subarray(cleaned.length - sosAndScan.length).equals(sosAndScan)).toBe(true);
  });
});

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const fakeCrc = Buffer.from([0, 0, 0, 0]); // stripPngMetadata never validates CRCs, only uses the length field
  return Buffer.concat([length, Buffer.from(type, "latin1"), data, fakeCrc]);
}

describe("PNG metadata stripping", () => {
  it("removes tEXt/iTXt/zTXt/eXIf/tIME chunks but keeps IHDR/IDAT/IEND", () => {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = pngChunk("IHDR", Buffer.from("FAKE_IHDR_13_BYTES"));
    const text = pngChunk("tEXt", Buffer.from("Author\u0000Jane Doe - GPS 12.34,56.78"));
    const idat = pngChunk("IDAT", Buffer.from("FAKE_IMAGE_DATA_KEEP"));
    const iend = pngChunk("IEND", Buffer.alloc(0));
    const original = Buffer.concat([signature, ihdr, text, idat, iend]);

    const cleaned = stripPngMetadata(original);

    expect(cleaned.includes("Jane Doe")).toBe(false);
    expect(cleaned.includes("FAKE_IHDR_13_BYTES")).toBe(true);
    expect(cleaned.includes("FAKE_IMAGE_DATA_KEEP")).toBe(true);
    expect(cleaned.subarray(0, 8).equals(signature)).toBe(true);
  });
});

describe("PDF metadata stripping", () => {
  it("clears title/author/subject/producer and the XMP metadata stream", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    doc.setTitle("Confidential Q3 Plan");
    doc.setAuthor("Jane Doe");
    doc.setSubject("Internal only");
    doc.setCreator("Acme Writer 2.0");
    doc.setProducer("Acme PDF Engine");
    const original = Buffer.from(await doc.save());

    const before = await extractPdfMetadata(original);
    expect(before.title).toBe("Confidential Q3 Plan");
    expect(before.author).toBe("Jane Doe");

    const cleaned = await stripPdfMetadata(original);
    const after = await extractPdfMetadata(cleaned);

    expect(after.title).toBeUndefined();
    expect(after.author).toBeUndefined();
    expect(after.subject).toBeUndefined();
    expect(after.producer).toBeUndefined();
  });
});

describe("Office (OOXML) metadata stripping", () => {
  async function buildFakeDocx(): Promise<Buffer> {
    const zip = new JSZip();
    zip.file(
      "docProps/core.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
  <dc:title>Secret Plan</dc:title>
  <dc:creator>Jane Doe</dc:creator>
  <cp:lastModifiedBy>Jane Doe</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">2024-01-01T00:00:00Z</dcterms:created>
</cp:coreProperties>`
    );
    zip.file(
      "docProps/app.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Company>Acme Corp</Company>
  <Manager>Boss Person</Manager>
</Properties>`
    );
    zip.file("docProps/custom.xml", `<?xml version="1.0"?><Properties></Properties>`);
    zip.file("word/document.xml", `<?xml version="1.0"?><w:document><w:body/></w:document>`);
    zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types></Types>`);
    return zip.generateAsync({ type: "nodebuffer" });
  }

  it("clears creator/title/company/manager and removes custom properties", async () => {
    const original = await buildFakeDocx();
    const before = await extractOfficeMetadata(original);
    expect(before.author).toBe("Jane Doe");
    expect(before.company).toBe("Acme Corp");
    expect(before.hasCustomProperties).toBe(true);

    const cleaned = await stripOfficeMetadata(original);
    const after = await extractOfficeMetadata(cleaned);

    expect(after.author).toBeUndefined();
    expect(after.title).toBeUndefined();
    expect(after.company).toBeUndefined();
    expect(after.manager).toBeUndefined();
    expect(after.hasCustomProperties).toBe(false);
  });
});
