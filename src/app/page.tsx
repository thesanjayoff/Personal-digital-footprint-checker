"use client";

import { useEffect, useState } from "react";
import { Card, PageTitle, SeverityBadge, EthicsBanner, Button } from "@/components/ui";

interface ScoreResponse {
  score: number;
  bandLabel: string;
  breakdown: { openCounts: Record<string, number> };
  history: { at: string; score: number }[];
}

interface Finding {
  id: string;
  title: string;
  severity: string;
  module: string;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
}

export default function DashboardPage() {
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRunMessage, setLastRunMessage] = useState<string | null>(null);

  async function load() {
    const [s, f] = await Promise.all([
      fetch("/api/score").then((r) => r.json()),
      fetch("/api/findings").then((r) => r.json()),
    ]);
    setScore(s);
    setFindings(f.findings);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    load();
  }, []);

  async function runChecks() {
    setRunning(true);
    setLastRunMessage(null);
    try {
      const res = await fetch("/api/runs", { method: "POST" });
      const data = await res.json();
      const newCount = data.outcome?.newFindings?.length ?? 0;
      setLastRunMessage(newCount > 0 ? `Run complete — ${newCount} new finding(s) detected.` : "Run complete — no new exposure found.");
      await load();
    } finally {
      setRunning(false);
    }
  }

  const open = findings.filter((f) => f.status === "open");
  const done = findings.filter((f) => f.status === "done");
  const recentNew = [...open]
    .sort((a, b) => (a.first_seen_at < b.first_seen_at ? 1 : -1))
    .slice(0, 5);

  return (
    <div>
      <PageTitle title="Dashboard" subtitle="Your exposure score, recent alerts, and open vs. fixed actions." />
      <EthicsBanner />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button onClick={runChecks} disabled={running}>
          {running ? "Running checks…" : "Run checks now"}
        </Button>
        {lastRunMessage && <span className="text-sm text-slate-500 dark:text-slate-400">{lastRunMessage}</span>}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <div className="text-sm text-slate-500 dark:text-slate-400">Exposure score</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-5xl font-bold text-slate-900 dark:text-slate-50">{score?.score ?? "—"}</span>
            <span className="text-sm text-slate-400">/ 100</span>
          </div>
          <div className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">{score?.bandLabel ?? ""}</div>
        </Card>

        <Card className="md:col-span-1">
          <div className="text-sm text-slate-500 dark:text-slate-400">Open vs. fixed</div>
          <div className="mt-2 flex gap-6">
            <div>
              <div className="text-3xl font-bold text-rose-600 dark:text-rose-400">{open.length}</div>
              <div className="text-xs text-slate-500">open</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{done.length}</div>
              <div className="text-xs text-slate-500">fixed</div>
            </div>
          </div>
        </Card>

        <Card className="md:col-span-1">
          <div className="text-sm text-slate-500 dark:text-slate-400">By severity (open)</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(score?.breakdown.openCounts ?? {})
              .filter(([sev]) => sev !== "info")
              .map(([sev, count]) => (
                <div key={sev} className="flex items-center gap-1.5">
                  <SeverityBadge severity={sev} />
                  <span className="text-sm font-medium">{count}</span>
                </div>
              ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Score history</div>
        {score && score.history.length > 1 ? (
          <ScoreSparkline history={score.history} />
        ) : (
          <p className="text-sm text-slate-500">Run checks a few times to build up a history chart.</p>
        )}
      </Card>

      <Card className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Most recent open findings</div>
          <a href="/checklist" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
            View full checklist →
          </a>
        </div>
        {recentNew.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing open. Add and verify identifiers, then run checks.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentNew.map((f) => (
              <li key={f.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-700 dark:text-slate-200">{f.title}</span>
                <SeverityBadge severity={f.severity} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ScoreSparkline({ history }: { history: { at: string; score: number }[] }) {
  const w = 600;
  const h = 80;
  const max = 100;
  const points = history
    .slice()
    .reverse()
    .map((h2, i) => {
      const x = (i / Math.max(1, history.length - 1)) * w;
      const y = h - (h2.score / max) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} className="text-indigo-500" />
    </svg>
  );
}
