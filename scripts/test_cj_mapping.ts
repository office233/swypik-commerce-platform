/**
 * Test CJ mapping: pid → vid → order ready
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getCJVariantId, extractCJPidFromSKU } from "../lib/suppliers/cj-order";

async function main() {
  // Test SKU extraction
  console.log("=== SKU EXTRACTION ===");
  const testSKUs = [
    "ACV-1835605396271550464",
    "ACV-A8AED9D7-8229-4759-A",
    "ACV-1658338665216614400",
    "RANDOM-SKU-123",
  ];
  
  for (const sku of testSKUs) {
    const pid = extractCJPidFromSKU(sku);
    console.log(`  ${sku} → pid: ${pid || "NOT CJ"}`);
  }

  // Test variant lookup for first real SKU
  console.log("\n=== VARIANT LOOKUP ===");
  const testPid = extractCJPidFromSKU(testSKUs[0]);
  if (testPid) {
    console.log(`Looking up vid for pid: ${testPid}`);
    const vid = await getCJVariantId(testPid);
    console.log(`Result: vid = ${vid || "NOT FOUND"}`);
  }

  // Wait and try second
  await new Promise(r => setTimeout(r, 1500));
  const testPid2 = extractCJPidFromSKU(testSKUs[2]);
  if (testPid2) {
    console.log(`\nLooking up vid for pid: ${testPid2}`);
    const vid = await getCJVariantId(testPid2);
    console.log(`Result: vid = ${vid || "NOT FOUND"}`);
  }

  console.log("\n✅ Mapping test complete");
}

main().catch(console.error);
