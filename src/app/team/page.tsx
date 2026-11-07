"use client";

import { useEffect, useState } from "react";
import { Card, PageTitle, Button, EthicsBanner } from "@/components/ui";

interface AggregateEntry {
  label: string;
  consentStatus: string;
  score: number | null;
  band: string | null;
  shared: boolean;
  findingCount?: number;
  openCritical?: number;
  openHigh?: number;
}

export default function TeamPage() {
  const [members, setMembers] = useState<AggregateEntry[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteResult, setInviteResult] = useState<{ memberId: string; verificationId: string; localCode?: string } | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const data = await fetch("/api/team").then((r) => r.json());
    setMembers(data.members);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    load();
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, email }),
    });
    const data = await res.json();
    if (res.ok) {
      setInviteResult({
        memberId: data.result.member.id,
        verificationId: data.result.verification.verificationId,
        localCode: data.result.verification.localCode,
      });
      await load();
    } else {
      setMessage(data.error ?? "Invite failed");
    }
  }

  async function confirmConsent() {
    if (!inviteResult) return;
    const res = await fetch(`/api/team/${inviteResult.memberId}/consent-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: inviteResult.verificationId, code }),
    });
    void res;
    setMessage("If the code was correct, this member is now consented. Refreshing list…");
    await load();
  }

  return (
    <div>
      <PageTitle
        title="Team consent"
        subtitle="Teammates verify their own identifiers and choose whether the admin sees anything beyond their score band."
      />
      <EthicsBanner />

      <Card className="mb-6">
        <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Their email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <Button type="submit">Invite</Button>
        </form>

        {inviteResult && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
            <p className="mb-2 text-slate-600 dark:text-slate-300">
              The teammate must verify their own email before they&apos;re consented. Have them check their inbox, or (if no SMTP
              is configured) use the code shown here.
            </p>
            {inviteResult.localCode && <p className="mb-2 font-mono text-lg font-semibold text-indigo-600 dark:text-indigo-400">{inviteResult.localCode}</p>}
            <input
              placeholder="Verification code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mr-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <Button onClick={confirmConsent}>Confirm consent</Button>
          </div>
        )}
        {message && <p className="mt-2 text-sm text-slate-500">{message}</p>}
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Admin view (aggregate, anonymized unless shared)</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <th className="py-2">Member</th>
              <th>Status</th>
              <th>Score</th>
              <th>Band</th>
              <th>Shared detail</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => (
              <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2">{m.label}</td>
                <td>{m.consentStatus}</td>
                <td>{m.score ?? "—"}</td>
                <td>{m.band ?? "—"}</td>
                <td>{m.shared ? `${m.findingCount} findings (${m.openCritical} critical, ${m.openHigh} high)` : "not shared"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 && <p className="py-4 text-sm text-slate-500">No team members invited yet.</p>}
      </Card>
    </div>
  );
}
