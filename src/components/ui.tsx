import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {children}
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </div>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  info: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info}`}>
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    dismissed: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    verified: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}>{status}</span>;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles: Record<string, string> = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-300",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
    danger: "bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function EthicsBanner() {
  return (
    <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <strong>For your own use only.</strong> This tool must never be used to look up or investigate another
      person without their explicit, verified consent. Every lookup requires ownership verification first.
    </div>
  );
}
