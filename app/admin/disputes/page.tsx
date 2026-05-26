import Link from "next/link";
import { dbQuery } from "@/lib/db";
import DisputeEvidenceForm from "./DisputeEvidenceForm";
import { scoreDispute, type WinScore } from "@/lib/stripe/dispute-win-score";

export const dynamic = "force-dynamic";

type SearchParams = { status?: string };

type Row = {
  id: string;
  dispute_id: string;
  charge_id: string;
  payment_intent_id: string | null;
  order_id: string | null;
  amount_cents: number;
  currency: string;
  reason: string | null;
  status: string;
  evidence_due_by: string | null;
  evidence_submitted: boolean;
  evidence_submitted_at: string | null;
  evidence_data: Record<string, string> | null;
  created_at: string;
  buyer_email: string | null;
  order_total_cents: number | null;
};

async function getDisputes(status: string): Promise<Row[]> {
  let where = "1=1";
  if (status === "needs_response") {
    where = "d.status IN ('needs_response','warning_needs_response')";
  } else if (status === "under_review") {
    where = "d.status IN ('under_review','warning_under_review')";
  } else if (status === "closed") {
    where = "d.status IN ('won','lost','warning_closed','charge_refunded')";
  }

  const { rows } = await dbQuery<Row>(
    `SELECT d.id::text, d.dispute_id, d.charge_id, d.payment_intent_id,
            d.order_id::text, d.amount_cents, d.currency, d.reason, d.status,
            d.evidence_due_by::text, d.evidence_submitted,
            d.evidence_submitted_at::text, d.evidence_data,
            d.created_at::text,
            u.email AS buyer_email,
            co.total_cents AS order_total_cents
       FROM stripe_disputes d
       LEFT JOIN commerce_orders co ON co.id = d.order_id
       LEFT JOIN users u ON u.id = co.buyer_user_id
      WHERE ${where}
      ORDER BY
        CASE WHEN d.status IN ('needs_response','warning_needs_response') THEN 0 ELSE 1 END,
        d.evidence_due_by NULLS LAST,
        d.created_at DESC
      LIMIT 200`,
  );
  return rows;
}

function fmtMoney(cents: number | null | undefined, currency = "RON"): string {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat("ro-RO", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function dueIndicator(iso: string | null): { label: string; tone: string } {
  if (!iso) return { label: "—", tone: "text-gray-500" };
  const due = new Date(iso).getTime();
  const now = Date.now();
  const hours = Math.round((due - now) / 3_600_000);
  if (hours < 0) return { label: `Expirat de ${Math.abs(hours)}h`, tone: "text-red-700 font-bold" };
  if (hours < 24) return { label: `${hours}h rămase`, tone: "text-red-600 font-bold" };
  if (hours < 72) return { label: `${Math.round(hours / 24)}z rămase`, tone: "text-orange-600 font-bold" };
  return { label: `${Math.round(hours / 24)}z rămase`, tone: "text-gray-700" };
}

const STATUS_BADGE: Record<string, string> = {
  needs_response: "bg-red-100 text-red-800",
  warning_needs_response: "bg-orange-100 text-orange-800",
  under_review: "bg-blue-100 text-blue-800",
  warning_under_review: "bg-blue-100 text-blue-800",
  won: "bg-green-100 text-green-800",
  warning_closed: "bg-gray-200 text-gray-700",
  charge_refunded: "bg-gray-200 text-gray-700",
  lost: "bg-red-200 text-red-900",
};

export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const active = sp.status || "needs_response";
  const disputes = await getDisputes(active);

  const tabs = [
    { value: "needs_response", label: "Necesită răspuns" },
    { value: "under_review", label: "În evaluare" },
    { value: "closed", label: "Închise" },
    { value: "all", label: "Toate" },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-[#0D0D0D]">Stripe Disputes</h1>
        <p className="text-sm text-gray-600 mt-1">
          Chargeback-uri. Răspunde cu evidence înainte de deadline sau pierzi banii + fee €15.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((t) => (
          <Link
            key={t.value}
            href={`/admin/disputes?status=${t.value}`}
            className={
              "px-3 py-1.5 rounded-lg text-sm font-semibold transition " +
              (active === t.value
                ? "bg-[#0D0D0D] text-white"
                : "bg-white border border-[#E5E5E5] text-gray-700 hover:bg-gray-50")
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {disputes.length === 0 ? (
        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-8 text-center text-sm text-gray-500">
          Niciun dispute în categoria selectată.
        </div>
      ) : (
        <div className="space-y-3">
          {disputes.map((d) => {
            const due = dueIndicator(d.evidence_due_by);
            const badge = STATUS_BADGE[d.status] || "bg-gray-100 text-gray-700";
            const canRespond = (d.status === "needs_response" || d.status === "warning_needs_response") && !d.evidence_submitted;
            const score: WinScore = scoreDispute({
              reason: d.reason,
              evidence: d.evidence_data,
              hasOrderLink: Boolean(d.order_id),
            });
            return (
              <details key={d.id} className="bg-white border border-[#E5E5E5] rounded-2xl overflow-hidden group">
                <summary className="cursor-pointer list-none p-4 flex flex-wrap items-center gap-3 hover:bg-gray-50">
                  <span className={"px-2 py-0.5 rounded-full text-xs font-bold " + badge}>{d.status}</span>
                  <span className="font-mono text-xs text-gray-500">{d.dispute_id}</span>
                  <span className="font-bold text-[#0D0D0D]">{fmtMoney(d.amount_cents, d.currency)}</span>
                  {canRespond && <WinBadge score={score} />}
                  <span className="text-xs text-gray-600 truncate max-w-[160px]" title={d.buyer_email || ""}>
                    {d.buyer_email || "—"}
                  </span>
                  {d.reason && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{d.reason}</span>}
                  <span className={"text-xs ml-auto " + due.tone}>{due.label}</span>
                  {d.evidence_submitted && (
                    <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800 font-semibold">
                      evidence submitted
                    </span>
                  )}
                </summary>

                <div className="p-4 border-t border-[#E5E5E5] bg-gray-50/50 space-y-3 text-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-gray-500">Charge:</span>{" "}
                      <span className="font-mono">{d.charge_id}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Order:</span>{" "}
                      {d.order_id ? (
                        <Link href={`/admin/orders/${d.order_id}`} className="font-mono text-violet-700 hover:underline">
                          {d.order_id.slice(0, 8)}…
                        </Link>
                      ) : (
                        <span className="text-gray-400">(necunoscut)</span>
                      )}
                    </div>
                    <div>
                      <span className="text-gray-500">Total comandă:</span>{" "}
                      {fmtMoney(d.order_total_cents, d.currency)}
                    </div>
                    <div>
                      <span className="text-gray-500">Deadline evidence:</span> {fmtDate(d.evidence_due_by)}
                    </div>
                    {d.evidence_submitted_at && (
                      <div>
                        <span className="text-gray-500">Submitted la:</span> {fmtDate(d.evidence_submitted_at)}
                      </div>
                    )}
                    <div>
                      <span className="text-gray-500">Primul eveniment:</span> {fmtDate(d.created_at)}
                    </div>
                  </div>

                  {canRespond && <WinScorePanel score={score} />}

                  {canRespond ? (
                    <DisputeEvidenceForm
                      disputeId={d.dispute_id}
                      draft={d.evidence_data}
                      suggestions={score.missing}
                    />
                  ) : d.evidence_data && Object.keys(d.evidence_data).length > 0 ? (
                    <div className="text-xs">
                      <div className="font-semibold mb-1 text-gray-700">Evidence trimisă:</div>
                      <pre className="bg-white border border-[#E5E5E5] rounded p-2 overflow-auto max-h-60 whitespace-pre-wrap">
                        {JSON.stringify(d.evidence_data, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WinBadge({ score }: { score: WinScore }) {
  const tone =
    score.label === "high"
      ? "bg-green-100 text-green-800"
      : score.label === "medium"
      ? "bg-amber-100 text-amber-900"
      : "bg-red-100 text-red-800";
  return (
    <span
      title={`Win score: ${score.score}% — ${score.recommendation}`}
      className={`text-xs font-bold px-2 py-0.5 rounded ${tone}`}
    >
      Win {score.score}%
    </span>
  );
}

function WinScorePanel({ score }: { score: WinScore }) {
  const barTone =
    score.label === "high"
      ? "bg-green-500"
      : score.label === "medium"
      ? "bg-amber-500"
      : "bg-red-500";
  const positives = score.factors.filter((f) => f.delta > 0);
  const negatives = score.factors.filter((f) => f.delta < 0);
  return (
    <div className="bg-white border border-[#E5E5E5] rounded p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold text-sm text-[#0D0D0D]">
          Estimare șansă câștig
        </div>
        <div className="text-xs text-gray-600">{score.recommendation}</div>
      </div>
      <div className="relative h-2 bg-gray-100 rounded overflow-hidden">
        <div className={`h-full ${barTone} transition-all`} style={{ width: `${score.score}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>0</span>
        <span className="font-bold text-sm text-[#0D0D0D]">{score.score}%</span>
        <span>100</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        <div>
          <div className="font-semibold text-green-700 mb-1">Avantaje ({positives.length})</div>
          {positives.length === 0 ? (
            <div className="text-gray-400">—</div>
          ) : (
            <ul className="space-y-0.5">
              {positives.map((f) => (
                <li key={f.tag} className="flex justify-between gap-2">
                  <span className="text-gray-700 truncate">{f.note}</span>
                  <span className="text-green-700 font-mono">+{f.delta}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="font-semibold text-red-700 mb-1">Penalizări ({negatives.length})</div>
          {negatives.length === 0 ? (
            <div className="text-gray-400">—</div>
          ) : (
            <ul className="space-y-0.5">
              {negatives.map((f) => (
                <li key={f.tag} className="flex justify-between gap-2">
                  <span className="text-gray-700 truncate">{f.note}</span>
                  <span className="text-red-700 font-mono">{f.delta}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {score.missing.length > 0 && (
        <div className="border-t border-[#E5E5E5] pt-2 mt-1">
          <div className="font-semibold text-violet-800 text-xs mb-1">
            ⚡ Top {score.missing.length} câmpuri lipsă (sortate după impact)
          </div>
          <ul className="space-y-1 text-xs">
            {score.missing.map((m) => (
              <li
                key={m.key}
                className="flex items-center justify-between gap-2 bg-violet-50 px-2 py-1 rounded"
              >
                <span className="text-gray-800 truncate" title={m.key}>
                  {m.label}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-violet-700 font-mono font-bold">+{m.potentialDelta}</span>
                  <span className="text-gray-500">→ {m.newScore}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {score.combos.length > 0 && (
        <div className="border-t border-[#E5E5E5] pt-2 mt-1">
          <div className="font-semibold text-emerald-800 text-xs mb-1">
            🎯 What-if combo (completare grupată)
          </div>
          <ul className="space-y-1 text-xs">
            {score.combos.map((c) => (
              <li
                key={c.size}
                className="flex items-start justify-between gap-2 bg-emerald-50 px-2 py-1 rounded"
              >
                <span className="text-gray-800 truncate">
                  Top {c.size}: <span className="text-gray-600">{c.labels.join(" + ")}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-emerald-700 font-mono font-bold">+{c.delta}</span>
                  <span className="text-gray-500">→ {c.newScore}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
