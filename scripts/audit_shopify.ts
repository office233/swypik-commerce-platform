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

  // Get count
  const countRes = await fetch(`https://${STORE}/admin/api/2026-04/products/count.json`, {
    headers: { "X-Shopify-Access-Token": token },
  });
  const count = (await countRes.json()).count;
  console.log(`📦 Total products in Shopify: ${count}\n`);

  // List ALL products with details
  let page = 1;
  let allProducts: any[] = [];
  let url: string | null = `https://${STORE}/admin/api/2026-04/products.json?limit=250&fields=id,title,status,variants,images,product_type,tags`;
  
  while (url) {
    const res = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
    const data = await res.json();
    allProducts.push(...(data.products || []));
    
    // Check for pagination
    const linkHeader = res.headers.get("link");
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      url = match ? match[1] : null;
    } else {
      url = null;
    }
  }

  console.log(`Found ${allProducts.length} products:\n`);
  
  let withImages = 0;
  let withPrice = 0;
  let active = 0;

  for (const p of allProducts) {
    const price = p.variants?.[0]?.price || "0";
    const compareAt = p.variants?.[0]?.compare_at_price || "-";
    const sku = p.variants?.[0]?.sku || "-";
    const imgCount = p.images?.length || 0;
    const hasImg = imgCount > 0;
    const isActive = p.status === "active";
    
    if (hasImg) withImages++;
    if (parseFloat(price) > 0) withPrice++;
    if (isActive) active++;

    console.log(`${hasImg ? "🖼" : "❌"} ${isActive ? "✅" : "⏸"} "${p.title}"`);
    console.log(`   Price: ${price} RON | Old: ${compareAt} | SKU: ${sku} | Images: ${imgCount} | Type: ${p.product_type}`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 SUMMARY:`);
  console.log(`   Total: ${allProducts.length}`);
  console.log(`   Active: ${active}`);
  console.log(`   With images: ${withImages}`);
  console.log(`   With price: ${withPrice}`);
}

main().catch(console.error);
