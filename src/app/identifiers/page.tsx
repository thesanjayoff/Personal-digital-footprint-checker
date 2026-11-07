"use client";

import { useEffect, useState } from "react";
import { Card, PageTitle, Button, StatusBadge } from "@/components/ui";

interface Identifier {
  id: string;
  type: "email" | "username" | "domain" | "github";
  value: string;
  verified_at: string | null;
  verification_method: string | null;
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = { email: "Email", username: "Username", domain: "Domain", github: "GitHub account" };

export default function IdentifiersPage() {
  const [identifiers, setIdentifiers] = useState<Identifier[]>([]);
  const [type, setType] = useState<Identifier["type"]>("email");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifyState, setVerifyState] = useState<Record<string, { verificationId: string; instructions?: string; localCode?: string }>>({});
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});
  const [profileUrlInputs, setProfileUrlInputs] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});

  async function load() {
    const data = await fetch("/api/identifiers").then((r) => r.json());
    setIdentifiers(data.identifiers);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    load();
  }, []);

  async function addIdentifier(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/identifiers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, value }) });
      setValue("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function startVerify(id: string) {
    const res = await fetch(`/api/identifiers/${id}/verify/start`, { method: "POST" });
    const data = await res.json();
    if (data.result) {
      setVerifyState((s) => ({ ...s, [id]: data.result }));
    } else {
      setMessages((m) => ({ ...m, [id]: data.error ?? "Could not start verification" }));
    }
  }

  async function confirmVerify(id: string) {
    const v = verifyState[id];
    if (!v) return;
    const res = await fetch(`/api/identifiers/${id}/verify/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: v.verificationId, code: codeInputs[id], profileUrl: profileUrlInputs[id] }),
    });
    const data = await res.json();
    if (data.result?.verified) {
      setMessages((m) => ({ ...m, [id]: "Verified!" }));
      setVerifyState((s) => ({ ...s, [id]: undefined as never }));
      await load();
    } else {
      setMessages((m) => ({ ...m, [id]: data.result?.reason ?? "Verification failed" }));
    }
  }

  async function remove(id: string) {
    await fetch(`/api/identifiers/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <PageTitle
        title="Identifiers"
        subtitle="Add the emails, usernames, domains, and GitHub account that are yours. Nothing is looked up until you verify ownership."
      />

      <Card className="mb-6">
        <form onSubmit={addIdentifier} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as Identifier["type"])}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="email">Email</option>
              <option value="username">Username</option>
              <option value="domain">Domain</option>
              <option value="github">GitHub account</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Value</label>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === "domain" ? "example.com" : type === "email" ? "you@example.com" : "yourhandle"}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <Button type="submit" disabled={busy}>
            Add identifier
          </Button>
        </form>
      </Card>

      <div className="space-y-4">
        {identifiers.map((ident) => {
          const v = verifyState[ident.id];
          return (
            <Card key={ident.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">{TYPE_LABEL[ident.type]}</div>
                  <div className="font-medium text-slate-900 dark:text-slate-50">{ident.value}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={ident.verified_at ? "verified" : "pending"} />
                  {!ident.verified_at && (
                    <Button variant="secondary" onClick={() => startVerify(ident.id)}>
                      Start verification
                    </Button>
                  )}
                  <Button variant="danger" onClick={() => remove(ident.id)}>
                    Remove
                  </Button>
                </div>
              </div>

              {v && (
                <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
                  {v.instructions && <p className="mb-2 text-slate-600 dark:text-slate-300">{v.instructions}</p>}
                  {v.localCode && (
                    <p className="mb-2 font-mono text-lg font-semibold text-indigo-600 dark:text-indigo-400">{v.localCode}</p>
                  )}
                  {ident.type === "email" && (
                    <input
                      placeholder="Enter the code"
                      value={codeInputs[ident.id] ?? ""}
                      onChange={(e) => setCodeInputs((s) => ({ ...s, [ident.id]: e.target.value }))}
                      className="mr-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  )}
                  {ident.type === "username" && (
                    <input
                      placeholder="Profile URL containing the token"
                      value={profileUrlInputs[ident.id] ?? ""}
                      onChange={(e) => setProfileUrlInputs((s) => ({ ...s, [ident.id]: e.target.value }))}
                      className="mr-2 w-80 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  )}
                  <Button onClick={() => confirmVerify(ident.id)}>Confirm</Button>
                </div>
              )}
              {messages[ident.id] && <p className="mt-2 text-sm text-slate-500">{messages[ident.id]}</p>}
            </Card>
          );
        })}
        {identifiers.length === 0 && <p className="text-sm text-slate-500">No identifiers yet.</p>}
      </div>
    </div>
  );
}
