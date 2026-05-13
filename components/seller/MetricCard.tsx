import { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: string;
  trendUp?: boolean;
}

export function MetricCard({ title, value, icon, trend, trendUp }: MetricCardProps) {
  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-neutral-500">{title}</h3>
        <div className="text-neutral-400">
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold text-[#0D0D0D]">{value}</span>
        {trend && (
          <span className={`text-sm font-medium ${trendUp ? "text-green-600" : "text-red-600"}`}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
