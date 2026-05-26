type Summary = { critical: number; high: number; medium: number; low: number };

export function SummaryCards({ summary }: { summary: Summary }) {
  const cards = [
    { label: "Critic", value: summary.critical, bg: "bg-red-50", border: "border-red-200", text: "text-red-700", val: "text-red-900" },
    { label: "Înalt", value: summary.high, bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", val: "text-orange-900" },
    { label: "Mediu", value: summary.medium, bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", val: "text-amber-900" },
    { label: "Scăzut", value: summary.low, bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", val: "text-emerald-900" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {cards.map((c) => (
        <div key={c.label} className={`${c.bg} border ${c.border} rounded p-3`}>
          <div className={`text-xs ${c.text} font-semibold uppercase tracking-wider`}>{c.label}</div>
          <div className={`text-2xl font-bold ${c.val}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}
