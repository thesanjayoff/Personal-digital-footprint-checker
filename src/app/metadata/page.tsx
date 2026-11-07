"use client";

import { useRef, useState } from "react";
import { Card, PageTitle, Button } from "@/components/ui";

export default function MetadataPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState<{ kind: string; summary: Record<string, unknown>; hasAnyMetadata: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onFileChange() {
    const file = fileRef.current?.files?.[0];
    setScan(null);
    setError(null);
    if (!file) return;
    setFileName(file.name);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/metadata/scan", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not scan file");
      else setScan(data.result);
    } finally {
      setBusy(false);
    }
  }

  async function downloadClean() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/metadata/clean", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Could not clean file");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clean-${file.name}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageTitle
        title="Metadata cleaner"
        subtitle="Upload a photo, PDF, or Office file you're about to publish and see what's hidden inside — then download a clean copy. Files are processed locally and never kept."
      />

      <Card className="mb-6">
        <input
          ref={fileRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,.docx,.xlsx,.pptx"
          onChange={onFileChange}
          className="block w-full text-sm text-slate-600 dark:text-slate-300"
        />
        {fileName && <p className="mt-2 text-sm text-slate-500">{busy ? "Scanning…" : `Scanned: ${fileName}`}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>

      {scan && (
        <Card>
          <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Detected type: <span className="font-mono">{scan.kind}</span>
          </div>
          {!scan.hasAnyMetadata ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">No hidden metadata found.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(scan.summary)
                  .filter(([k, v]) => k !== "raw" && v !== undefined && v !== null && v !== false)
                  .map(([k, v]) => (
                    <tr key={k} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-2 pr-4 font-medium capitalize text-slate-600 dark:text-slate-300">{k.replace(/([A-Z])/g, " $1")}</td>
                      <td className="py-2 text-slate-800 dark:text-slate-100">{typeof v === "object" ? JSON.stringify(v) : String(v)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
          <div className="mt-4">
            <Button onClick={downloadClean} disabled={busy}>
              Download clean copy
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
