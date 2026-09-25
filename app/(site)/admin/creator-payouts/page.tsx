/**
 * Admin — cereri de retragere ale creatorilor (payout_requests, kind = 'creator').
 * „Marchează plătit” = transfer Stripe Connect când e disponibil, altfel confirmarea
 * transferului bancar manual; „Respinge” = suma revine în portofel.
 */
import { requireAdminSession } from "@/lib/security/admin-auth";
import { CreatorPayoutsAdmin } from "./_components/CreatorPayoutsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminCreatorPayoutsPage() {
  await requireAdminSession();
  return <CreatorPayoutsAdmin />;
}
