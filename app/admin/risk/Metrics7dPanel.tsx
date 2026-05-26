export type Metrics7d = {
  totalDecisions: number;
  approvals: number;
  blocks: number;
  autoBlocks: number;
  flaggedOrders: number;
  blockRate: number;
  approveRate: number;
};

export function Metrics7dPanel({ metrics }: { metrics: Metrics7d }) {
  return (
    <div className="bg-white border border-[#E5E5E5] rounded p-3">
      <div className="text-xs font-semibold text-gray-700 mb-2">📊 Activitate ultimele 7 zile</div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
        <Stat label="Comenzi flagged" value={metrics.flaggedOrders} />
        <Stat
          label="Aprobate"
          value={metrics.approvals}
          pct={metrics.approveRate}
          tone="emerald"
        />
        <Stat
          label="Blocate (manual)"
          value={metrics.blocks}
          pct={metrics.blockRate}
          tone="red"
        />
        <Stat label="User auto-block" value={metrics.autoBlocks} tone="orange" />
        <Stat label="Total decizii" value={metrics.totalDecisions} />
      </div>
      {metrics.blockRate > 60 && metrics.totalDecisions >= 5 && (
        <div className="mt-2 text-[11px] bg-red-50 text-red-800 px-2 py-1 rounded">
          ⚠ Rate de block ridicată ({metrics.blockRate}%) — verifică dacă weight-urile scoring nu produc false positives.
        </div>
      )}
      {metrics.approveRate > 80 && metrics.totalDecisions >= 5 && (
        <div className="mt-2 text-[11px] bg-amber-50 text-amber-800 px-2 py-1 rounded">
          ℹ Rate de approve ridicată ({metrics.approveRate}%) — scoring poate fi prea agresiv, ridică pragul de review.
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: number;
  pct?: number;
  tone?: "emerald" | "red" | "orange";
}) {
  const text =
    tone === "emerald" ? "text-emerald-700"
      : tone === "red" ? "text-red-700"
      : tone === "orange" ? "text-orange-700"
      : "text-gray-900";
  return (
    <div>
      <div className={`text-[10px] uppercase tracking-wider ${tone ? text : "text-gray-500"}`}>
        {label}
      </div>
      <div className={`text-lg font-bold ${text}`}>
        {value}
        {pct !== undefined && (
          <span className="text-[10px] font-normal text-gray-500"> ({pct}%)</span>
        )}
      </div>
    </div>
  );
}
