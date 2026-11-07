import JSZip from "jszip";

export interface OfficeMetadataSummary {
  title?: string;
  author?: string;
  lastModifiedBy?: string;
  company?: string;
  manager?: string;
  createdAt?: string;
  modifiedAt?: string;
  hasCustomProperties: boolean;
}

function extractTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return m?.[1]?.trim() || undefined;
}

export async function extractOfficeMetadata(buf: Buffer): Promise<OfficeMetadataSummary> {
  const zip = await JSZip.loadAsync(buf);
  const core = (await zip.file("docProps/core.xml")?.async("string")) ?? "";
  const app = (await zip.file("docProps/app.xml")?.async("string")) ?? "";
  return {
    title: extractTag(core, "dc:title"),
    author: extractTag(core, "dc:creator"),
    lastModifiedBy: extractTag(core, "cp:lastModifiedBy"),
    company: extractTag(app, "Company"),
    manager: extractTag(app, "Manager"),
    createdAt: extractTag(core, "dcterms:created"),
    modifiedAt: extractTag(core, "dcterms:modified"),
    hasCustomProperties: !!zip.file("docProps/custom.xml"),
  };
}

function clearTag(xml: string, tag: string): string {
  return xml.replace(new RegExp(`<${tag}([^>]*)>([^<]*)</${tag}>`), `<${tag}$1></${tag}>`);
}

export async function stripOfficeMetadata(buf: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  const coreFile = zip.file("docProps/core.xml");
  if (coreFile) {
    let core = await coreFile.async("string");
    for (const tag of ["dc:title", "dc:creator", "dc:subject", "dc:description", "cp:lastModifiedBy", "cp:keywords", "cp:category"]) {
      core = clearTag(core, tag);
    }
    zip.file("docProps/core.xml", core);
  }
  const appFile = zip.file("docProps/app.xml");
  if (appFile) {
    let app = await appFile.async("string");
    for (const tag of ["Company", "Manager"]) {
      app = clearTag(app, tag);
    }
    zip.file("docProps/app.xml", app);
  }
  if (zip.file("docProps/custom.xml")) {
    zip.remove("docProps/custom.xml");
  }
  const out = await zip.generateAsync({ type: "nodebuffer" });
  return out;
}
