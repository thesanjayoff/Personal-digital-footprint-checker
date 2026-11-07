import { PDFDocument, PDFName } from "pdf-lib";

export interface PdfMetadataSummary {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  createdAt?: string;
  modifiedAt?: string;
}

export async function extractPdfMetadata(buf: Buffer): Promise<PdfMetadataSummary> {
  const doc = await PDFDocument.load(buf, { updateMetadata: false, ignoreEncryption: true });
  return {
    title: doc.getTitle() || undefined,
    author: doc.getAuthor() || undefined,
    subject: doc.getSubject() || undefined,
    keywords: doc.getKeywords() || undefined,
    creator: doc.getCreator() || undefined,
    producer: doc.getProducer() || undefined,
    createdAt: doc.getCreationDate()?.toISOString(),
    modifiedAt: doc.getModificationDate()?.toISOString(),
  };
}

export async function stripPdfMetadata(buf: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(buf, { updateMetadata: false, ignoreEncryption: true });
  doc.setTitle("");
  doc.setAuthor("");
  doc.setSubject("");
  doc.setKeywords([]);
  doc.setCreator("");
  doc.setProducer("");
  try {
    doc.catalog.delete(PDFName.of("Metadata")); // drops the embedded XMP packet, if any
  } catch {
    // no XMP stream present — nothing to drop
  }
  const bytes = await doc.save({ updateFieldAppearances: false });
  return Buffer.from(bytes);
}
