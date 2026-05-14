import * as React from "react";
import { cn } from "./cn";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-[var(--swp-surface-2)] text-[var(--swp-text)] border-[var(--swp-border)]",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
  accent: "bg-[var(--swp-primary)]/10 text-[var(--swp-primary-700)] border-[var(--swp-primary)]/20",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        toneClasses[tone],
        className
      )}
      {...rest}
    />
  );
}
