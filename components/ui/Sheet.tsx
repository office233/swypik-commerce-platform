"use client";

import * as React from "react";
import { cn } from "./cn";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  ariaLabel?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  side?: "bottom" | "right";
  className?: string;
}

export function Sheet({
  open,
  onClose,
  ariaLabel,
  title,
  description,
  children,
  side = "bottom",
  className,
}: SheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const panelClasses =
    side === "bottom"
      ? "absolute inset-x-0 bottom-0 max-h-[90dvh] rounded-t-3xl"
      : "absolute inset-y-0 right-0 w-full max-w-md sm:rounded-l-3xl";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : ariaLabel}
      className="fixed inset-0 z-[80]"
    >
      <button
        type="button"
        aria-label="Închide"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
      />
      <div
        className={cn(
          "bg-[var(--swp-surface)] shadow-2xl border border-[var(--swp-border)]",
          "flex flex-col overflow-hidden safe-pb",
          panelClasses,
          className
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 border-b border-[var(--swp-border)] px-5 pt-5 pb-4">
            <div>
              {title ? (
                <h2 className="text-lg font-bold text-[var(--swp-text)]">{title}</h2>
              ) : null}
              {description ? (
                <p className="mt-1 text-sm text-[var(--swp-text-muted)]">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Închide"
              className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--swp-surface-2)] text-xl text-[var(--swp-text)] hover:bg-[var(--swp-surface-3)]"
            >
              ×
            </button>
          </div>
        )}
        <div className="overflow-y-auto px-5 py-4 flex-1">{children}</div>
      </div>
    </div>
  );
}
