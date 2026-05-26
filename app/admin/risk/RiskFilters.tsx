import Link from "next/link";

export function RiskFilters({
  statusFilter,
  minScore,
}: {
  statusFilter: string;
  minScore: number;
}) {
  const statuses = [
    { k: "paid", label: "Paid (de fulfilla)" },
    { k: "pending", label: "Pending" },
    { k: "fulfilled", label: "Fulfilled" },
    { k: "all", label: "Toate" },
  ];
  const mins = [0, 30, 50, 70];
  return (
    <div className="flex gap-2 text-xs flex-wrap">
      {statuses.map((f) => (
        <Link
          key={f.k}
          href={`/admin/risk?status=${f.k}${minScore > 0 ? `&min=${minScore}` : ""}`}
          className={`px-3 py-1.5 rounded font-medium ${
            statusFilter === f.k
              ? "bg-violet-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {f.label}
        </Link>
      ))}
      <span className="ml-auto self-center text-gray-500">Filtrează min score:</span>
      {mins.map((m) => (
        <Link
          key={m}
          href={`/admin/risk?status=${statusFilter}&min=${m}`}
          className={`px-2 py-1.5 rounded ${
            minScore === m ? "bg-violet-100 text-violet-800 font-semibold" : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          ≥{m}
        </Link>
      ))}
    </div>
  );
}
