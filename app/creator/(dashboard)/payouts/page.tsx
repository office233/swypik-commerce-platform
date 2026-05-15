import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";
import PayoutsClient from "./PayoutsClient";

export const dynamic = "force-dynamic";

export default async function PayoutsPage() {
  const auth = await getAuthUser();
  if (auth.role === "guest") redirect("/account?redirect=/creator/payouts");
  if (auth.role !== "creator" && auth.role !== "seller" && auth.role !== "admin") {
    redirect("/become-a-creator");
  }

  const { rows: payoutRows } = await dbQuery<any>(
    `SELECT id, status, currency, gross_amount_cents, platform_fee_cents, net_amount_cents,
            period_start, period_end, paid_at, created_at
       FROM commission_payouts
      WHERE creator_id = $1
      ORDER BY created_at DESC
      LIMIT 10`,
    [auth.userId],
  ).catch(() => ({ rows: [] as any[] }));

  const { rows: transferRows } = await dbQuery<any>(
    `SELECT ct.id, ct.status, ct.currency, ct.amount_cents, ct.reversed_amount_cents,
            ct.submitted_at, ct.completed_at, ct.failed_at, ct.failure_message,
            ct.provider_transfer_id, ct.created_at
       FROM connect_transfers ct
       JOIN creator_connect_accounts cca ON cca.id = ct.connect_account_id
      WHERE cca.creator_id = $1
      ORDER BY ct.created_at DESC
      LIMIT 20`,
    [auth.userId],
  ).catch(() => ({ rows: [] as any[] }));

  return <PayoutsClient recentPayouts={payoutRows} recentTransfers={transferRows} />;
}
