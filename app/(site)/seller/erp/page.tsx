import { redirect } from "next/navigation";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { ErpConnection } from "@/components/seller/erp/ErpConnection";

export const dynamic = "force-dynamic";

/** Conectare ERP (URL validat anti-SSRF + cheie criptată — /api/seller/erp/*). */
export default async function SellerErpPage() {
  const sellerId = await getSellerSessionId();
  if (!sellerId) redirect("/seller/login?next=/seller/erp");
  return <ErpConnection />;
}
