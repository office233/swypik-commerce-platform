import * as React from "react";
import { cn } from "./cn";
import { Label } from "./Label";

export interface FieldProps {
  id?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Field({ id, label, hint, error, required, className, children }: FieldProps) {
  const hintId = hint && id ? `${id}-hint` : undefined;
  const errorId = error && id ? `${id}-error` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-[var(--swp-danger)]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-[var(--swp-text-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
