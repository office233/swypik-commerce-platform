"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Printer,
  X,
  FileCode,
} from "lucide-react";
import { logger } from "@/lib/logger";
import { escapeXml } from "@/lib/seller/invoicing";

export type InvoiceRow = {
  id: string;
  series: string;
  number: number;
  invoice_number: string;
  client_name: string;
  client_cui: string | null;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  status: string;
  efactura_status: string;
  created_at: string;
};

type Props = {
  initialInvoices: InvoiceRow[];
  defaultSeries: string;
};

export default function InvoicesClient({ initialInvoices, defaultSeries }: Props) {
  const t = useTranslations("sellerBilling.invoices");
  const locale = useLocale();
  const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New Invoice Form State
  const [clientName, setClientName] = useState("");
  const [clientCui, setClientCui] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [series, setSeries] = useState(defaultSeries || "FACT");
  const [vatRate, setVatRate] = useState<number>(21);
  const [items, setItems] = useState<Array<{ title: string; quantity: number; price: string }>>([
    { title: "", quantity: 1, price: "" },
  ]);

  const addItemRow = () => {
    setItems((prev) => [...prev, { title: "", quantity: 1, price: "" }]);
  };

  const updateItem = (index: number, field: keyof (typeof items)[number], val: string | number) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, [field]: val } : it))
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculations for the new-invoice preview only. The authoritative totals
  // (integer cents) are computed server-side by computeInvoiceTotals(); this
  // is display-only rounding for the modal summary, never sent as truth.
  const totalAmount = items.reduce(
    (acc, it) => acc + (parseFloat(it.price) || 0) * (it.quantity || 1),
    0
  );
  const subtotalAmount = vatRate > 0 ? totalAmount / (1 + vatRate / 100) : totalAmount;
  const vatAmount = totalAmount - subtotalAmount;

  const errorMessage = (code: string | undefined): string => {
    switch (code) {
      case "unauthorized":
        return t("errUnauthorized");
      case "rate_limited":
        return t("errRateLimited");
      case "validation_error":
        return t("errValidation");
      case "invalid_client":
        return t("errInvalidClient");
      default:
        return t("errUnknown");
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || items.length === 0) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/seller/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          clientCui,
          clientAddress,
          series,
          vatRate,
          items,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        alert(errorMessage(data?.error));
        return;
      }

      // Use the server-computed row verbatim (integer cents, real status,
      // real series/number) instead of re-deriving totals client-side —
      // avoids float-rounding drift between the modal preview and the DB row.
      const newInv: InvoiceRow = data.invoice;

      setInvoices((prev) => [newInv, ...prev]);
      setIsModalOpen(false);
      resetForm();
    } catch (err) {
      logger.error({ err }, "[SellerInvoices] create invoice failed");
      alert(t("errNetwork"));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setClientName("");
    setClientCui("");
    setClientAddress("");
    setVatRate(21);
    setItems([{ title: "", quantity: 1, price: "" }]);
  };

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.client_cui && inv.client_cui.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const fmtMoney = (cents: number) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "RON",
      }).format((cents || 0) / 100);
    } catch {
      return `${((cents || 0) / 100).toFixed(2)} RON`;
    }
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  const downloadEFacturaXml = (inv: InvoiceRow) => {
    const issueDate = new Date(inv.created_at).toISOString().split("T")[0];
    const totalRon = (inv.total_cents / 100).toFixed(2);
    const subtotalRon = (inv.subtotal_cents / 100).toFixed(2);
    const vatRon = (inv.vat_cents / 100).toFixed(2);
    const effectiveVatPercent =
      inv.subtotal_cents > 0
        ? Math.round((inv.vat_cents / inv.subtotal_cents) * 100)
        : 21;
    const taxCategoryCode = effectiveVatPercent === 0 ? "E" : "S";
    const safeClientName = escapeXml(inv.client_name);
    const safeInvoiceNumber = escapeXml(inv.invoice_number);
    const safeClientCui = inv.client_cui ? escapeXml(inv.client_cui) : null;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID>
  <cbc:ID>${safeInvoiceNumber}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>RON</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>Swypik Merchant</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>RO99999999</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${safeClientName}</cbc:Name></cac:PartyName>
      ${safeClientCui ? `<cac:PartyTaxScheme><cbc:CompanyID>${safeClientCui}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RON">${vatRon}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RON">${subtotalRon}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RON">${vatRon}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${taxCategoryCode}</cbc:ID>
        <cbc:Percent>${effectiveVatPercent.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RON">${subtotalRon}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RON">${subtotalRon}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RON">${totalRon}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RON">${totalRon}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;

    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inv.invoice_number}-eFactura.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header with Search and New Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3 text-neutral-400 w-4 h-4" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 bg-[#0D0D0D] hover:bg-neutral-800 text-white px-5 py-2.5 min-h-[44px] rounded-xl font-bold text-sm shadow-sm transition"
        >
          <Plus size={16} /> {t("newInvoice")}
        </button>
      </div>

      {/* Invoices Table */}
      <div className="bg-white border border-[#E5E5E5] rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F7F7F8] border-b border-[#E5E5E5] text-xs font-bold text-neutral-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">{t("thSeriesNumber")}</th>
                <th className="px-6 py-4">{t("thClient")}</th>
                <th className="px-6 py-4">{t("thIssueDate")}</th>
                <th className="px-6 py-4">{t("thTotal")}</th>
                <th className="px-6 py-4">{t("thStatus")}</th>
                <th className="px-6 py-4">{t("thEfactura")}</th>
                <th className="px-6 py-4 text-right">{t("thActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-[#F7F7F8]/60 transition">
                  <td className="px-6 py-4 font-black text-violet-700 font-mono whitespace-nowrap">
                    {inv.invoice_number}
                  </td>
                  <td className="px-6 py-4 max-w-[220px]">
                    <div className="font-bold text-[#0D0D0D] break-words">{inv.client_name}</div>
                    {inv.client_cui && (
                      <div className="text-[11px] text-neutral-400 font-mono break-words">
                        {t("cui")}: {inv.client_cui}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-neutral-600 text-xs font-medium whitespace-nowrap">
                    {fmtDate(inv.created_at)}
                  </td>
                  <td className="px-6 py-4 font-black text-[#0D0D0D] whitespace-nowrap">
                    {fmtMoney(inv.total_cents)}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                      <CheckCircle2 size={12} /> {t("statusPaid")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                      <Clock size={12} /> {t("efacturaReady")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => downloadEFacturaXml(inv)}
                        className="px-2.5 py-1.5 min-h-[40px] rounded-lg border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition text-xs font-bold flex items-center gap-1"
                        title={t("downloadXmlTitle")}
                        aria-label={t("downloadXmlTitle")}
                      >
                        <FileCode size={13} /> {t("downloadXml")}
                      </button>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-neutral-500 hover:text-[#0D0D0D] rounded-lg hover:bg-neutral-100 transition"
                        title={t("printTitle")}
                        aria-label={t("printTitle")}
                      >
                        <Printer size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-neutral-400 text-sm">
                    {t("emptyState")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Emite Factură */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-5 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E5E5E5] pb-4">
              <div className="flex items-center gap-2 text-lg font-black text-[#0D0D0D]">
                <FileText className="w-5 h-5 text-violet-600" />
                {t("modalTitle")}
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700"
                aria-label={t("closeModal")}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    {t("clientNameLabel")}
                  </label>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder={t("clientNamePlaceholder")}
                    className="w-full px-3 py-2 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    {t("seriesLabel")}
                  </label>
                  <input
                    type="text"
                    value={series}
                    onChange={(e) => setSeries(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500 uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    {t("cuiLabel")}
                  </label>
                  <input
                    type="text"
                    value={clientCui}
                    onChange={(e) => setClientCui(e.target.value)}
                    placeholder={t("cuiPlaceholder")}
                    className="w-full px-3 py-2 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    {t("addressLabel")}
                  </label>
                  <input
                    type="text"
                    value={clientAddress}
                    onChange={(e) => setClientAddress(e.target.value)}
                    placeholder={t("addressPlaceholder")}
                    className="w-full px-3 py-2 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    {t("vatRateLabel")}
                  </label>
                  <select
                    value={vatRate}
                    onChange={(e) => setVatRate(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                  >
                    <option value={21}>{t("vatStandard")}</option>
                    <option value={11}>{t("vatReduced")}</option>
                    <option value={0}>{t("vatExempt")}</option>
                  </select>
                </div>
              </div>

              {/* Items Section */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                    {t("itemsLabel")}
                  </span>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="text-xs font-bold text-violet-600 hover:text-violet-700 min-h-[40px] px-2"
                  >
                    {t("addLine")}
                  </button>
                </div>

                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        required
                        value={it.title}
                        onChange={(e) => updateItem(idx, "title", e.target.value)}
                        placeholder={t("itemTitlePlaceholder")}
                        className="flex-1 min-w-0 px-3 py-2 border border-[#E5E5E5] rounded-lg text-xs font-medium"
                      />
                      <input
                        type="number"
                        min="1"
                        value={it.quantity}
                        onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                        placeholder={t("itemQtyPlaceholder")}
                        aria-label={t("itemQtyPlaceholder")}
                        className="w-16 shrink-0 px-2 py-2 border border-[#E5E5E5] rounded-lg text-xs font-medium text-center"
                      />
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={it.price}
                        onChange={(e) => updateItem(idx, "price", e.target.value)}
                        placeholder={t("itemPricePlaceholder")}
                        aria-label={t("itemPricePlaceholder")}
                        className="w-24 shrink-0 px-2 py-2 border border-[#E5E5E5] rounded-lg text-xs font-medium text-right"
                      />
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="text-neutral-400 hover:text-red-600 p-1 min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
                          aria-label={t("removeLine")}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals Summary */}
              <div className="bg-[#F7F7F8] p-4 rounded-xl text-xs space-y-1 text-neutral-600">
                <div className="flex justify-between">
                  <span>{t("subtotalNoVat")}</span>
                  <span className="font-semibold">{fmtMoney(Math.round(subtotalAmount * 100))}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("vatLabel", { rate: vatRate })}</span>
                  <span className="font-semibold">{fmtMoney(Math.round(vatAmount * 100))}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-[#0D0D0D] pt-1 border-t border-neutral-200">
                  <span>{t("totalInvoice")}</span>
                  <span className="text-violet-700">{fmtMoney(Math.round(totalAmount * 100))}</span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl border border-neutral-200 text-xs font-bold hover:bg-neutral-50"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 min-h-[44px] rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  {submitting ? t("submitting") : t("submit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
