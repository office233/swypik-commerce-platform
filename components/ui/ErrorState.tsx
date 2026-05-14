import * as React from "react";
import { cn } from "./cn";

export interface ErrorStateProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function ErrorState({
  title = "A apărut o eroare",
  description,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        "rounded-2xl border border-red-200 bg-red-50 px-6 py-10",
        className
      )}
    >
      <h3 className="text-base font-bold text-red-800">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-red-700">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
