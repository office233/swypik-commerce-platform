import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await getAuthSession();
  if (!session) redirect("/auth?next=/orders");

  const { rows } = await dbQuery<{ id: string; status: string; total_cents: number; currency: string; created_at: string }>(
    "SELECT id, status, total_cents, currency, created_at FROM commerce_orders WHERE buyer_user_id = $1 ORDER BY created_at DESC LIMIT 50",
    [session.userId]
  );

  return (
    <main className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Comenzile mele</h1>
      {rows.length === 0 ? (
        <p className="text-white/60">Nu ai comenzi încă.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((o) => (
            <li key={o.id}>
              <Link
                href={`/orders/${o.id}`}
                className="block p-4 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl"
              >
                #{o.id.slice(0, 8)} — {o.status} — {(Number(o.total_cents) / 100).toFixed(2)}{" "}
                {o.currency || "RON"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
