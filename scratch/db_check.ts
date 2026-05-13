import { getCategoryHierarchy } from "../lib/db/product-queries";

async function run() {
  const roots = await getCategoryHierarchy("ro");
  const mens = roots.find((r: any) => r.id === "root:apparel");
  if (mens) {
    console.log(mens.children.map((c: any) => `${c.name} (${c.id})`).join("\n"));
  } else {
    console.log("No mens category found");
  }
  process.exit(0);
}

run().catch(console.error);
