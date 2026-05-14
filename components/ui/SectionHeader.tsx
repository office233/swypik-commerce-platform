import * as React from "react";
import { cn } from "./cn";

export interface SectionHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--swp-text-muted)]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-lg sm:text-xl font-bold text-[var(--swp-text)] leading-tight">
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-[var(--swp-text-muted)] mt-1">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
