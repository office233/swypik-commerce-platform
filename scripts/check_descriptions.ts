import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const STORE = process.env.SHOPIFY_STORE!;
  const auth = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET, grant_type: "client_credentials"}),
  });
  const token = (await auth.json()).access_token;
  
  const res = await fetch(`https://${STORE}/admin/api/2026-04/products.json?limit=3&fields=id,title,body_html,variants`, {
    headers: {"X-Shopify-Access-Token": token},
  });
  const data = await res.json();
  
  for (const p of (data.products || [])) {
    console.log("=" .repeat(60));
    console.log("TITLE:", p.title);
    console.log("PRICE:", p.variants?.[0]?.price, "RON");
    console.log("OLD PRICE:", p.variants?.[0]?.compare_at_price, "RON");
    console.log("COST:", p.variants?.[0]?.cost, "RON");
    console.log("");
    console.log("DESCRIPTION (HTML):");
    console.log(p.body_html);
    console.log("");
  }
}

main().catch(console.error);
