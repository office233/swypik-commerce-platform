import * as React from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        "rounded-2xl border border-dashed border-[var(--swp-border)] bg-[var(--swp-surface-2)]/40",
        "px-6 py-12 sm:py-16",
        className
      )}
    >
      {icon ? (
        <div
          className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-[var(--swp-surface)] border border-[var(--swp-border)] text-[var(--swp-text-muted)]"
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-bold text-[var(--swp-text)]">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-[var(--swp-text-muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
