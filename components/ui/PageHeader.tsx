import * as React from "react";
import { cn } from "./cn";

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--swp-text)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-sm sm:text-base text-[var(--swp-text-muted)]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
