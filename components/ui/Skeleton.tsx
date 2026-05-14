import * as React from "react";
import { cn } from "./cn";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rounded?: "sm" | "md" | "lg" | "xl" | "full";
}

const radiusMap = {
  sm: "rounded",
  md: "rounded-md",
  lg: "rounded-xl",
  xl: "rounded-2xl",
  full: "rounded-full",
} as const;

export function Skeleton({ className, rounded = "lg", ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("shimmer bg-[var(--swp-surface-2)]", radiusMap[rounded], className)}
      {...rest}
    />
  );
}
