require("dotenv").config({ path: ".env.local" });

async function main() {
  const store = process.env.SHOPIFY_STORE;
  const adminToken = "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";
  
  console.log("Creating Storefront Access Token...");
  const res = await fetch(`https://${store}/admin/api/2026-04/storefront_access_tokens.json`, {
    method: "POST",
    headers: { 
      "X-Shopify-Access-Token": adminToken, 
      "Content-Type": "application/json" 
    },
    body: JSON.stringify({ 
      storefront_access_token: { 
        title: "AICeVrei Checkout v2" 
      } 
    })
  });
  
  const data = await res.json();
  console.log("Result:", JSON.stringify(data, null, 2));
  
  if (data.storefront_access_token?.access_token) {
    console.log("\n" + "=".repeat(60));
    console.log("✅ STOREFRONT ACCESS TOKEN:");
    console.log(data.storefront_access_token.access_token);
    console.log("=".repeat(60));
    console.log("\nAdd this to .env.local:");
    console.log(`SHOPIFY_STOREFRONT_ACCESS_TOKEN=${data.storefront_access_token.access_token}`);
    console.log("\nAnd add to Vercel Environment Variables!");
  }
}

main().catch(e => console.error(e.message));
