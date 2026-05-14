import * as React from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[var(--swp-text)] text-white hover:bg-black active:scale-[0.98] disabled:bg-[var(--swp-muted)]",
  secondary:
    "bg-[var(--swp-surface-2)] text-[var(--swp-text)] border border-[var(--swp-border)] hover:bg-[var(--swp-surface-3)] active:scale-[0.98]",
  ghost:
    "bg-transparent text-[var(--swp-text)] hover:bg-[var(--swp-surface-2)] active:scale-[0.98]",
  danger:
    "bg-[var(--swp-danger)] text-white hover:opacity-90 active:scale-[0.98]",
  accent:
    "bg-[var(--swp-primary)] text-white hover:bg-[var(--swp-primary-600)] active:scale-[0.98] disabled:bg-[var(--swp-muted)]",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-lg",
  md: "h-11 px-4 text-sm rounded-xl",
  lg: "h-12 px-6 text-base rounded-xl",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    fullWidth,
    loading,
    leftIcon,
    rightIcon,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--swp-primary)] focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {loading ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : (
        leftIcon
      )}
      <span className="truncate">{children}</span>
      {!loading && rightIcon}
    </button>
  );
});
