import * as React from "react";
import { cn } from "./cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, rows = 4, ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "block w-full min-h-[96px] rounded-xl border bg-white px-4 py-3 text-base text-[var(--swp-text)]",
        "placeholder:text-[var(--swp-text-muted)] transition-colors resize-y",
        "focus:outline-none focus:ring-2 focus:ring-[var(--swp-primary)]/20 focus:border-[var(--swp-primary)]",
        "disabled:cursor-not-allowed disabled:bg-[var(--swp-surface-2)] disabled:opacity-70",
        invalid
          ? "border-[var(--swp-danger)] focus:ring-[var(--swp-danger)]/20 focus:border-[var(--swp-danger)]"
          : "border-[var(--swp-border)]",
        className
      )}
      {...rest}
    />
  );
});
