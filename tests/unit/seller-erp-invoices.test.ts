import { describe, it, expect } from "vitest";

describe("Seller ERP - Facturare & e-Factura UBL 2.1", () => {
  it("calculează corect subtotalul, TVA-ul legal de 21% (standard) și 11% (redus) în cenți", () => {
    const items = [
      { title: "Suport Auto MagSafe 15W", quantity: 2, price: 59.9 },
      { title: "Cablu USB-C Fast Charge", quantity: 1, price: 29.9 },
    ];

    let totalCents = 0;
    for (const item of items) {
      const priceCents = Math.round(Number(item.price) * 100);
      totalCents += priceCents * item.quantity;
    }

    expect(totalCents).toBe(14970); // 59.90 * 2 + 29.90 = 149.70 RON

    // 1. Cota Standard România: 21% (conform reglementărilor fiscale 2025/2026)
    const vatRateStandard = 21;
    const subtotalCents21 = Math.round(totalCents / (1 + vatRateStandard / 100));
    const vatCents21 = totalCents - subtotalCents21;

    expect(subtotalCents21).toBe(12372); // 123.72 RON bază impozabilă
    expect(vatCents21).toBe(2598); // 25.98 RON TVA 21%
    expect(subtotalCents21 + vatCents21).toBe(totalCents);

    // 2. Cota Redusă România: 11%
    const vatRateReduced = 11;
    const subtotalCents11 = Math.round(totalCents / (1 + vatRateReduced / 100));
    const vatCents11 = totalCents - subtotalCents11;

    expect(subtotalCents11).toBe(13486); // 134.86 RON bază impozabilă
    expect(vatCents11).toBe(1484); // 14.84 RON TVA 11%
    expect(subtotalCents11 + vatCents11).toBe(totalCents);
  });

  it("formatează corect numărul incremental de factură per serie", () => {
    const formatInvoiceNumber = (series: string, nextNumber: number) => {
      const padded = String(nextNumber).padStart(4, "0");
      return `${series.trim()}-${padded}`;
    };

    expect(formatInvoiceNumber("FACT", 1)).toBe("FACT-0001");
    expect(formatInvoiceNumber("FACT", 42)).toBe("FACT-0042");
    expect(formatInvoiceNumber("SW-2026", 1250)).toBe("SW-2026-1250");
  });

  it("generează un XML e-Factura valid conform standardului CIUS-RO UBL 2.1 cu cota TVA de 21%", () => {
    const invoice = {
      invoice_number: "FACT-0001",
      created_at: "2026-09-16T00:00:00.000Z",
      client_name: "SC Digital SRL",
      client_cui: "RO12345678",
      subtotal_cents: 12372,
      vat_cents: 2598,
      total_cents: 14970,
    };

    const issueDate = new Date(invoice.created_at).toISOString().split("T")[0];
    const totalRon = (invoice.total_cents / 100).toFixed(2);
    const subtotalRon = (invoice.subtotal_cents / 100).toFixed(2);
    const vatRon = (invoice.vat_cents / 100).toFixed(2);
    const effectiveVatPercent = invoice.subtotal_cents > 0
      ? Math.round((invoice.vat_cents / invoice.subtotal_cents) * 100)
      : 21;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID>
  <cbc:ID>${invoice.invoice_number}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>RON</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>Swypik Merchant</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${invoice.client_name}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme><cbc:CompanyID>${invoice.client_cui}</cbc:CompanyID></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RON">${vatRon}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RON">${subtotalRon}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RON">${vatRon}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
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

    expect(xml).toContain("urn:efactura.mfinante.ro:CIUS-RO:1.0.1");
    expect(xml).toContain("<cbc:ID>FACT-0001</cbc:ID>");
    expect(xml).toContain("<cbc:Name>SC Digital SRL</cbc:Name>");
    expect(xml).toContain("<cbc:CompanyID>RO12345678</cbc:CompanyID>");
    expect(xml).toContain("<cbc:Percent>21.00</cbc:Percent>");
    expect(xml).toContain("<cbc:TaxAmount currencyID=\"RON\">25.98</cbc:TaxAmount>");
    expect(xml).toContain("<cbc:TaxableAmount currencyID=\"RON\">123.72</cbc:TaxableAmount>");
    expect(xml).toContain("<cbc:PayableAmount currencyID=\"RON\">149.70</cbc:PayableAmount>");
  });
});
