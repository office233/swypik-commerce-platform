import { BadgeCheck } from "lucide-react";

export default function VerifiedBadge({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center text-[#1D9BF0] ${className}`}
      title="Cont verificat"
      aria-label="Cont verificat"
    >
      <BadgeCheck size={size} fill="currentColor" stroke="#fff" strokeWidth={2.5} />
    </span>
  );
}
