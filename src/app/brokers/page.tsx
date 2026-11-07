"use client";

import { useEffect, useState } from "react";
import { Card, PageTitle } from "@/components/ui";

interface Broker {
  id: string;
  name: string;
  searchUrl: string;
  optOutUrl: string;
  difficulty: string;
  optOut: { status: string };
}

interface Identifier {
  id: string;
  type: string;
  value: string;
  verified_at: string | null;
}

const STATUS_OPTIONS = ["not_started", "requested", "confirmed", "relisted"];

export default function BrokersPage() {
  const [identifiers, setIdentifiers] = useState<Identifier[]>([]);
  const [identifierId, setIdentifierId] = useState<string>("");
  const [brokers, setBrokers] = useState<Broker[]>([]);

  useEffect(() => {
    fetch("/api/identifiers")
      .then((r) => r.json())
      .then((d) => {
        setIdentifiers(d.identifiers);
        const email = d.identifiers.find((i: Identifier) => i.type === "email" && i.verified_at);
        if (email) setIdentifierId(email.id);
      });
  }, []);

  async function loadBrokers(id: string) {
    const data = await fetch(`/api/brokers?identifierId=${id}`).then((r) => r.json());
    setBrokers(data.brokers);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-identifier-change
    if (identifierId) loadBrokers(identifierId);
  }, [identifierId]);

  async function setStatus(brokerId: string, status: string) {
    await fetch(`/api/brokers/${brokerId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifierId, status }),
    });
    await loadBrokers(identifierId);
  }

  return (
    <div>
      <PageTitle
        title="Data broker check"
        subtitle="A maintained list of people-search sites to check by hand, with an opt-out tracker. Nothing here is scraped automatically."
      />

      <Card className="mb-6">
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Track opt-outs for</label>
        <select
          value={identifierId}
          onChange={(e) => setIdentifierId(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Select a verified identifier…</option>
          {identifiers
            .filter((i) => i.verified_at)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.type}: {i.value}
              </option>
            ))}
        </select>
      </Card>

      <div className="space-y-3">
        {brokers.map((b) => (
          <Card key={b.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-50">{b.name}</div>
                <div className="text-xs text-slate-400">opt-out difficulty: {b.difficulty}</div>
              </div>
              <div className="flex items-center gap-2">
                <a href={b.searchUrl} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
                  Search ↗
                </a>
                <a href={b.optOutUrl} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
                  Opt out ↗
                </a>
                <select
                  value={b.optOut.status}
                  disabled={!identifierId}
                  onChange={(e) => setStatus(b.id, e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>
        ))}
        {!identifierId && <p className="text-sm text-slate-500">Verify an identifier first, then select it above to track opt-outs.</p>}
      </div>
    </div>
  );
}
