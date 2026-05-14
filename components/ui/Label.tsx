import * as React from "react";
import { cn } from "./cn";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export function Label({ className, required, children, ...rest }: LabelProps) {
  return (
    <label
      className={cn("block text-sm font-semibold text-[var(--swp-text)]", className)}
      {...rest}
    >
      {children}
      {required ? <span className="ml-0.5 text-[var(--swp-danger)]">*</span> : null}
    </label>
  );
}
