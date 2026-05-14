import * as React from "react";
import { cn } from "./cn";

export interface LoadingStateProps {
  label?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function LoadingState({ label = "Se încarcă…", className, compact }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        compact ? "py-6" : "py-12",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--swp-border)] border-t-[var(--swp-primary)]"
      />
      <p className="text-sm font-medium text-[var(--swp-text-muted)]">{label}</p>
    </div>
  );
}
