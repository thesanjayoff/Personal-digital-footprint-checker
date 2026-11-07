"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/identifiers", label: "Identifiers", icon: "🪪" },
  { href: "/checklist", label: "Checklist", icon: "✅" },
  { href: "/metadata", label: "Metadata cleaner", icon: "🧹" },
  { href: "/accounts", label: "Account inventory", icon: "🔐" },
  { href: "/brokers", label: "Data brokers", icon: "🗂️" },
  { href: "/team", label: "Team consent", icon: "👥" },
  { href: "/settings", label: "Settings & audit log", icon: "⚙️" },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen w-full">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800/10 bg-slate-950 p-4 text-slate-200 md:flex dark:border-slate-200/10">
        <div className="mb-6 px-2">
          <div className="text-lg font-semibold tracking-tight text-white">Digital Footprint</div>
          <div className="text-xs text-slate-400">Checker — local &amp; private</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-400">
          <strong className="text-slate-200">For you only.</strong> Never use this tool to look up anyone who
          hasn&apos;t explicitly consented and verified.
        </div>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white/70 px-4 py-3 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-950/70">
          <span className="font-semibold">Digital Footprint Checker</span>
        </header>
        <main className="flex-1 bg-slate-50 p-4 md:p-8 dark:bg-slate-950">{children}</main>
      </div>
    </div>
  );
}
