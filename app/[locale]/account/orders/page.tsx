import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft, Package } from "lucide-react";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";
import { formatCurrency } from "@/lib/i18n/currency";
import { CURRENCY_COOKIE, isCurrency, DEFAULT_CURRENCY, type Currency } from "@/lib/i18n/config";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  status: string;
  total_cents: number;
  currency: string;
  created_at: string;
  item_count: string;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("ro-RO", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default async function OrdersPage() {
  const t = await getTranslations("accountOrders");
  const user = await getAuthUser();
  if (!user.userId) redirect("/account?redirect=/account/orders");

  const STATUS_LABELS: Record<string, string> = {
    pending: t("statusPending"),
    paid: t("statusPaid"),
    processing: t("statusProcessing"),
    fulfilled: t("statusFulfilled"),
    delivered: t("statusDelivered"),
    cancelled: t("statusCancelled"),
    refunded: t("statusRefunded"),
    return_requested: t("statusReturnRequested"),
  };

  const cookieStore = await cookies();
  const cookieCurrency = cookieStore.get(CURRENCY_COOKIE)?.value;
  const displayCurrency: Currency =
    cookieCurrency && isCurrency(cookieCurrency) ? cookieCurrency : DEFAULT_CURRENCY;

  const { rows } = await dbQuery<Row>(
    `SELECT o.id, o.status, o.total_cents, o.currency, o.created_at,
            (SELECT count(*) FROM commerce_order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM commerce_orders o
      WHERE o.buyer_user_id = $1
      ORDER BY o.created_at DESC
      LIMIT 100`,
    [user.userId],
  );

  return (
    <main className="min-h-screen bg-black text-white pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-black/80 backdrop-blur border-b border-white/10">
        <Link href="/account" className="p-1 -ml-1">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-lg font-black">{t("headerComenzi")}</h1>
      </header>
      <div className="px-4 pt-4 max-w-2xl mx-auto">
        {rows.length === 0 ? (
          <p className="text-white/50 text-sm mt-8 text-center">{t("nuAiComenziInca")}</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/account/orders/${r.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 hover:bg-white/[0.07]"
                >
                  <div className="size-10 rounded-full bg-white/10 flex items-center justify-center">
                    <Package size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm md:text-base font-semibold">
                      
                      {t("comanda")}{r.id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-white/60">
                      {fmtDate(r.created_at)} · {r.item_count} {Number(r.item_count) === 1 ? t("produs") : t("produse")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold">
                      {formatCurrency(r.total_cents, {
                        sourceCurrency: (r.currency?.trim() as Currency) || "RON",
                        displayCurrency,
                        locale: "ro",
                      })}
                    </div>
                    <div className="text-[10px] text-white/50">
                      {STATUS_LABELS[r.status] || r.status}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
