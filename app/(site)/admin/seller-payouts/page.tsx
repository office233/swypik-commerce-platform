/**
 * Admin — cereri de retragere ale seller-ilor (payout_requests, kind = 'seller').
 * „Marchează plătit” = transfer Stripe Connect când e disponibil, altfel confirmarea
 * transferului bancar manual (IBAN); „Respinge” = item-urile revin în soldul seller-ului.
 */
import { requireAdminSession } from "@/lib/security/admin-auth";
import { CreatorPayoutsAdmin } from "../creator-payouts/_components/CreatorPayoutsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminSellerPayoutsPage() {
  await requireAdminSession();
  return <CreatorPayoutsAdmin endpoint="/api/admin/seller-payouts" ns="adminSellerPayouts" />;
}
