import { dbQuery } from "@/lib/db";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import InvoicesClient, { InvoiceRow } from "./InvoicesClient";

export const dynamic = "force-dynamic";

export default async function SellerInvoicesPage() {
  const t = await getTranslations("sellerBilling.invoices");
  const sellerId = await getSellerSessionId();
  if (!sellerId) {
    redirect("/seller/login");
  }

  // Get seller default invoice series
  const { rows: sellerRows } = await dbQuery<{ business_details: Record<string, unknown> | null }>(
    "SELECT business_details FROM sellers WHERE id = $1",
    [sellerId]
  );
  const rawInvoiceSeries = sellerRows[0]?.business_details?.invoiceSeries;
  const defaultSeries = typeof rawInvoiceSeries === "string" && rawInvoiceSeries.trim() ? rawInvoiceSeries : "FACT";

  // Load invoices
  const { rows: invoices } = await dbQuery<InvoiceRow>(
    `SELECT
       id,
       series,
       number,
       invoice_number,
       client_name,
       client_cui,
       subtotal_cents,
       vat_cents,
       total_cents,
       status,
       efactura_status,
       created_at
     FROM seller_invoices
     WHERE seller_id = $1
     ORDER BY created_at DESC
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

      <InvoicesClient initialInvoices={invoices} defaultSeries={defaultSeries} />
    </div>
  );
}
