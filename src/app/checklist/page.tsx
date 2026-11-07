"use client";

import { useEffect, useState } from "react";
import { Card, PageTitle, SeverityBadge, Button } from "@/components/ui";

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  recommendation: string;
  severity: string;
  module: string;
  effort: string;
  links: { label: string; url: string }[];
  status: string;
  is_new: boolean;
}

export default function ChecklistPage() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [filter, setFilter] = useState<string>("all");

  async function load() {
    const data = await fetch("/api/checklist").then((r) => r.json());
    setItems(data.checklist);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    load();
  }, []);

  async function setStatus(id: string, status: "done" | "dismissed") {
    await fetch(`/api/findings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
  }

  const filtered = filter === "all" ? items : items.filter((i) => i.severity === filter);

  return (
    <div>
      <PageTitle title="Cleanup checklist" subtitle="Ordered by impact-per-effort — the top items reduce your exposure the most for the least work." />

      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "critical", "high", "medium", "low", "info"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === s ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((item) => (
          <Card key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <SeverityBadge severity={item.severity} />
                  {item.is_new && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      new
                    </span>
                  )}
                  <span className="text-xs uppercase tracking-wide text-slate-400">{item.module.replace(/_/g, " ")}</span>
                </div>
                <div className="font-medium text-slate-900 dark:text-slate-50">{item.title}</div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>
                <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">→ {item.recommendation}</p>
                {item.links.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-3">
                    {item.links.map((l) => (
                      <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
                        {l.label} ↗
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" onClick={() => setStatus(item.id, "done")}>
                  Mark done
                </Button>
                <Button variant="ghost" onClick={() => setStatus(item.id, "dismissed")}>
                  Dismiss
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-sm text-slate-500">Nothing open in this filter.</p>}
      </div>
    </div>
  );
}
