/**
 * Delete ALL products from Shopify store
 * Run: npx tsx scripts/delete_all_products.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const STORE = process.env.SHOPIFY_STORE!;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET!;

async function getToken() {
  const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`OAuth failed: ${res.status}`);
  return (await res.json()).access_token;
}

async function main() {
  const token = await getToken();
  console.log("🔑 Token OK");

  let deleted = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(`https://${STORE}/admin/api/2026-04/products.json?limit=250`, {
      headers: { "X-Shopify-Access-Token": token },
    });
    const data = await res.json();
    const products = data.products || [];

    if (products.length === 0) { hasMore = false; break; }

    for (const p of products) {
      const del = await fetch(`https://${STORE}/admin/api/2026-04/products/${p.id}.json`, {
        method: "DELETE",
        headers: { "X-Shopify-Access-Token": token },
      });
      if (del.ok) {
        deleted++;
        if (deleted % 10 === 0) console.log(`🗑️  ${deleted} deleted...`);
      } else if (del.status === 429) {
        console.log("⏳ Rate limited, waiting 2s...");
        await new Promise(r => setTimeout(r, 2000));
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n✅ DONE! ${deleted} products deleted from Shopify.`);
}

main().catch(console.error);
