import { redirect } from "next/navigation";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import SellerDashboardClient from "./SellerDashboardClient";

export const dynamic = "force-dynamic";

export default async function SellerPage() {
  const sellerId = await getSellerSessionId();
  if (!sellerId) redirect("/seller/login?next=/seller");
  return <SellerDashboardClient />;
}
