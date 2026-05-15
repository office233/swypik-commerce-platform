export async function placeOrderWithSupplier(orderId: string, items: any[]) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "https://api.swypik.com";
  // Extragere simulată din DB a informațiilor comenzii (ex: Adresa de livrare)
  // În producție am face o interogare în baza de date folosind `orderId`
  const mockOrderDbResult = {
    metadata: {
      shipping_address: {
        firstName: "Ion",
        lastName: "Popescu",
        phone: "+40722123456",
        address1: "Bulevardul Unirii Nr. 10, Bloc 2, Ap 5",
        city: "Bucuresti",
        province: "Bucuresti",
        zip: "030167",
        country: "RO"
      },
      customer_email: "ion.popescu@example.com"
    }
  };

  // Preluăm adresa de livrare din metadata comenzii
  const shippingAddress = mockOrderDbResult.metadata.shipping_address;

  // Formatarea array-ului de produse pentru API-ul din China (CJ Dropshipping / AliExpress)
  const formattedProducts = items.map((item, idx) => ({
    sku: item.sku || `MOCK-SKU-${idx + 1}`,
    vid: item.variant_id || "VAR_DEFAULT",
    quantity: item.quantity || 1,
    shipping_name: "CJ_Packet_Romanian",
    price: item.price || 0,
    properties: item.properties || {}
  }));

  // Construirea payload-ului uriaș care va fi trimis către furnizor
  const supplierPayload = {
    out_order_number: orderId,
    shipping_address: shippingAddress,
    customer_email: mockOrderDbResult.metadata.customer_email,
    products: formattedProducts,
    logistics_name: "CJPacket",
    order_type: "api_dropshipping",
    remark: "Please do not include invoices or promotional materials. Dropshipping order.",
    webhook_callbacks: {
      on_shipped: `${apiBase}/webhooks/supplier/shipped`,
      on_delivered: `${apiBase}/webhooks/supplier/delivered`
    },
    timestamp: new Date().toISOString()
  };

  // Log mare cu payload-ul generat pentru verificarea de către Admin înainte de live
  console.log("\n==================================================================");
  console.log(`🚀 [Agent 13 - Supplier API] INIȚIALIZARE COMANDĂ CĂTRE CHINA`);
  console.log(`📦 ORDER ID: ${orderId}`);
  console.log("==================================================================");
  console.log("PAYLOAD JSON GENERAT (PENTRU VERIFICARE ADMIN):");
  console.log(JSON.stringify(supplierPayload, null, 2));
  console.log("==================================================================\n");

  // Returnează mock-ul de succes conform cerințelor
  return {
    success: true,
    external_order_id: "CJ_99213123",
    status: "processing"
  };
}
