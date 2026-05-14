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

  return <PayoutsClient recentPayouts={payoutRows} />;
}
