import { dbQuery } from "@/lib/db";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import ClientsClient, { ClientRow } from "./ClientsClient";

export const dynamic = "force-dynamic";

export default async function SellerClientsPage() {
  const t = await getTranslations("sellerBilling.clients");
  const sellerId = await getSellerSessionId();
  if (!sellerId) {
    redirect("/seller/login");
  }

  const { rows: clients } = await dbQuery<ClientRow>(
    `SELECT
       id,
       name,
       cui,
       reg_com,
       phone,
       email,
       address,
       city,
       county,
       notes,
       created_at
     FROM seller_clients
     WHERE seller_id = $1
     ORDER BY name ASC
     LIMIT 100`,
    [sellerId]
  );

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-6">
      <div>
        <h1 className="text-xl font-black text-[#0D0D0D]">{t("pageTitle")}</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          {t("pageSubtitle")}
        </p>
      </div>

      <ClientsClient initialClients={clients} />
    </div>
  );
}
