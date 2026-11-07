"use client";

import { useEffect, useState } from "react";
import { Card, PageTitle, Button } from "@/components/ui";

interface ModuleInfo {
  id: string;
  name: string;
  description: string;
  dataSource: string;
  termsUrl: string;
}

interface AuditEntry {
  id: string;
  ts: string;
  module: string;
  action: string;
  details: string | null;
}

export default function SettingsPage() {
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [hibpConfigured, setHibpConfigured] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  async function load() {
    const [s, a] = await Promise.all([fetch("/api/settings").then((r) => r.json()), fetch("/api/audit").then((r) => r.json())]);
    setToggles(s.toggles);
    setModules(s.modules);
    setHibpConfigured(s.hibpConfigured);
    setAudit(a.entries);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    load();
  }, []);

  async function toggle(id: string, enabled: boolean) {
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moduleId: id, enabled }) });
    setToggles((t) => ({ ...t, [id]: enabled }));
  }

  async function deleteAll() {
    if (!confirm("This permanently deletes every identifier, finding, run, and imported account for you. Continue?")) return;
    await fetch("/api/privacy/delete-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner: "me" }) });
    await load();
    alert("All your data has been deleted.");
  }

  return (
    <div>
      <PageTitle title="Settings & audit log" subtitle="Every module's data source and terms, toggles for external lookups, and a full log of every lookup ever made." />

      {!hibpConfigured && (
        <Card className="mb-6 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            HIBP_API_KEY is not set, so breach checking is disabled. Get a key at{" "}
            <a className="underline" href="https://haveibeenpwned.com/API/Key" target="_blank" rel="noreferrer">
              haveibeenpwned.com/API/Key
            </a>{" "}
            and add it to your environment.
          </p>
        </Card>
      )}

      <Card className="mb-6">
        <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Modules, data sources &amp; terms</div>
        <div className="space-y-3">
          {modules.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 dark:border-slate-800">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-50">{m.name}</div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{m.description}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Source: {m.dataSource} ·{" "}
                  <a href={m.termsUrl} target="_blank" rel="noreferrer" className="underline">
                    terms
                  </a>
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={toggles[m.id] ?? true} onChange={(e) => toggle(m.id, e.target.checked)} />
                enabled
              </label>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-6">
        <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Export report</div>
        <div className="flex gap-3">
          <a href="/api/report?format=markdown">
            <Button variant="secondary">Download Markdown</Button>
          </a>
          <a href="/api/report?format=pdf">
            <Button variant="secondary">Download PDF</Button>
          </a>
        </div>
      </Card>

      <Card className="mb-6 border-red-200 dark:border-red-900">
        <div className="mb-2 text-sm font-semibold text-red-700 dark:text-red-400">Danger zone</div>
        <p className="mb-3 text-sm text-slate-500">Permanently delete every identifier, finding, run, and imported account for you.</p>
        <Button variant="danger" onClick={deleteAll}>
          Delete all my data
        </Button>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Audit log (most recent lookups)</div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="py-2">Time</th>
                <th>Module</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 whitespace-nowrap text-xs text-slate-400">{e.ts}</td>
                  <td>{e.module}</td>
                  <td>{e.action}</td>
                  <td className="max-w-md truncate text-xs text-slate-500" title={e.details ?? ""}>
                    {e.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
