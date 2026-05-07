import { config } from "dotenv";
config({ path: ".env.local" });

import { ensureOnShopify } from "./lib/shopify/just-in-time-push";
import { createNativeCheckout } from "./lib/shopify/storefront-checkout";

async function testJIT() {
  try {
    console.log("1. Starting JIT test for a fake product...");
    const fakePgId = Math.floor(Math.random() * 1000000);
    console.log(`Using random pgId: ${fakePgId}`);

    const pushResult = await ensureOnShopify(
      fakePgId, 
      99.99, 
      149.99, 
      "Test Product JIT - " + fakePgId, 
      "https://picsum.photos/400", 
      "Test > JIT"
    );

    console.log("✅ ensureOnShopify success:", pushResult);

    console.log("2. Creating checkout link with variant:", pushResult.variantId);
    
    const checkoutData = await createNativeCheckout([{
      variantId: pushResult.variantId,
      quantity: 1
    }]);

    console.log("✅ createNativeCheckout success:", checkoutData);

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
  process.exit(0);
}

testJIT();
