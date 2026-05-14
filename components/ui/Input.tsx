import * as React from "react";
import { cn } from "./cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, type = "text", ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "block w-full min-h-[44px] rounded-xl border bg-white px-4 py-2.5 text-base text-[var(--swp-text)]",
        "placeholder:text-[var(--swp-text-muted)] transition-colors",
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
