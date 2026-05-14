import * as React from "react";
import { cn } from "./cn";

type Padding = "none" | "sm" | "md" | "lg";
const padMap: Record<Padding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: Padding;
  interactive?: boolean;
  as?: React.ElementType;
}

export function Card({
  padding = "md",
  interactive,
  className,
  as,
  ...rest
}: CardProps) {
  const Comp = (as || "div") as React.ElementType;
  return (
    <Comp
      className={cn(
        "bg-[var(--swp-surface)] border border-[var(--swp-border)] rounded-2xl shadow-sm",
        interactive && "transition-all hover:shadow-md hover:border-[var(--swp-border-strong)]",
        padMap[padding],
        className
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex items-start justify-between gap-3", className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-base font-bold text-[var(--swp-text)] leading-tight", className)}
      {...rest}
    />
  );
}

export function CardSubtitle({ className, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-[var(--swp-text-muted)] mt-1", className)} {...rest} />
  );
}
