import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const STORE = process.env.SHOPIFY_STORE!;
  const CID = process.env.SHOPIFY_CLIENT_ID!;
  const CS = process.env.SHOPIFY_CLIENT_SECRET!;

  const auth = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CID, client_secret: CS, grant_type: "client_credentials" }),
  });
  const token = (await auth.json()).access_token;
  console.log("Token OK");

  const res = await fetch(`https://${STORE}/admin/api/2026-04/products/count.json`, {
    headers: { "X-Shopify-Access-Token": token },
  });
  const data = await res.json();
  console.log("Products in Shopify:", data.count);

  if (data.count > 0) {
    const listRes = await fetch(`https://${STORE}/admin/api/2026-04/products.json?limit=5&fields=id,title`, {
      headers: { "X-Shopify-Access-Token": token },
    });
    const listData = await listRes.json();
    for (const p of (listData.products || [])) {
      console.log(`  - ${p.title} (ID: ${p.id})`);
    }
  }
}

main().catch(console.error);
