"use client";

import { useEffect, useRef, useState } from "react";
import { Card, PageTitle, Button, StatusBadge } from "@/components/ui";

interface Account {
  id: string;
  service_name: string;
  username: string | null;
  last_used_at: string | null;
  has_mfa: boolean | null;
  password_strength: string;
  breached: boolean;
  status: string;
  deleteUrl?: string;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [checkBreaches, setCheckBreaches] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await fetch("/api/accounts").then((r) => r.json());
    setAccounts(data.accounts);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    load();
  }, []);

  async function importCsv() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setSummary(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("owner", "me");
      form.append("checkBreaches", String(checkBreaches));
      const res = await fetch("/api/accounts/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setSummary(data.error ?? "Import failed");
      } else {
        setSummary(
          `Imported ${data.summary.imported}: ${data.summary.weak} weak, ${data.summary.reused} reused, ${data.summary.breached} breached passwords.`
        );
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: Account["status"]) {
    await fetch(`/api/accounts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
  }

  async function deleteAll() {
    if (!confirm("Delete the entire imported account inventory?")) return;
    await fetch("/api/accounts", { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <PageTitle
        title="Account inventory"
        subtitle="Import a password manager or Takeout-style CSV export. Passwords are only used in memory, for one pass, and are never stored."
      />

      <Card className="mb-6">
        <input ref={fileRef} type="file" accept=".csv" className="block w-full text-sm text-slate-600 dark:text-slate-300" />
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={checkBreaches} onChange={(e) => setCheckBreaches(e.target.checked)} />
          Check each password against Pwned Passwords (k-anonymity; sends only a 5-char hash prefix per password)
        </label>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={importCsv} disabled={busy}>
            {busy ? "Importing…" : "Import CSV"}
          </Button>
          <Button variant="danger" onClick={deleteAll}>
            Delete all imported data
          </Button>
        </div>
        {summary && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{summary}</p>}
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <th className="py-2">Service</th>
              <th>Username</th>
              <th>Password</th>
              <th>Breached</th>
              <th>MFA</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2 font-medium">{a.service_name}</td>
                <td className="text-slate-500">{a.username ?? "—"}</td>
                <td>
                  <span
                    className={
                      a.password_strength === "weak" || a.password_strength === "reused"
                        ? "text-red-600 dark:text-red-400"
                        : "text-slate-500"
                    }
                  >
                    {a.password_strength}
                  </span>
                </td>
                <td>{a.breached ? <span className="text-red-600 dark:text-red-400">yes</span> : "no"}</td>
                <td>{a.has_mfa === null ? "unknown" : a.has_mfa ? "yes" : <span className="text-red-600 dark:text-red-400">no</span>}</td>
                <td>
                  <StatusBadge status={a.status === "active" ? "verified" : "pending"} />
                </td>
                <td className="flex gap-2 py-2">
                  <Button variant="ghost" onClick={() => setStatus(a.id, "to_delete")}>
                    Flag to delete
                  </Button>
                  {a.deleteUrl && (
                    <a href={a.deleteUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline dark:text-indigo-400">
                      Delete-account steps ↗
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {accounts.length === 0 && <p className="py-4 text-sm text-slate-500">No accounts imported yet.</p>}
      </Card>
    </div>
  );
}
