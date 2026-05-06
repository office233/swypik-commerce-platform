const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const API_KEY = "CJ4956855@api@de9a956925154416b295b771d2eb7a95";

async function run() {
  const authRes = await fetch(CJ_BASE + "/authentication/getAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: API_KEY }),
  });
  const auth = await authRes.json();
  const token = auth.data?.accessToken || auth.data;

  // Get ALL categories
  const res = await fetch(CJ_BASE + "/product/getCategory", {
    headers: { "CJ-Access-Token": token }
  });
  const json = await res.json();

  let grandTotal = 0;
  let leafCount = 0;
  let nonEmptyLeafs = 0;
  const results = [];

  for (const main of (json.data || [])) {
    let mainTotal = 0;
    const mainName = main.categoryFirstName;
    const subs = main.categoryFirstList || [];

    for (const sub of subs) {
      const leafs = sub.categorySecondList || [];
      for (const leaf of leafs) {
        leafCount++;
        // Check product count - rate limit 1/sec
        await new Promise(r => setTimeout(r, 1100));
        try {
          const url = CJ_BASE + "/product/listV2?categoryId=" + leaf.categoryId + "&page=1&size=1";
          const pRes = await fetch(url, { headers: { "CJ-Access-Token": token } });
          const pJson = await pRes.json();
          const count = pJson.data?.totalRecords || 0;
          
          if (count > 0) {
            nonEmptyLeafs++;
            mainTotal += Math.min(count, 3000); // API cap is 3000 per category
            results.push({
              main: mainName,
              sub: sub.categorySecondName,
              leaf: leaf.categoryName,
              id: leaf.categoryId,
              total: count,
              pullable: Math.min(count, 3000)
            });
          }
          
          process.stdout.write("\r  Scanning... " + leafCount + " categories checked, " + nonEmptyLeafs + " with products");
        } catch (e) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    
    console.log("\n" + mainName.padEnd(35) + "| " + mainTotal + " produse pullable");
    grandTotal += mainTotal;
  }

  console.log("\n" + "=".repeat(70));
  console.log("TOTAL CJ DROPSHIPPING");
  console.log("=".repeat(70));
  console.log("  Categorii leaf total:    " + leafCount);
  console.log("  Categorii cu produse:    " + nonEmptyLeafs);
  console.log("  Produse PULLABLE total:  " + grandTotal);
  console.log("  (cap 3000/categorie de la API)");
  
  // Top 20 categories
  results.sort((a, b) => b.pullable - a.pullable);
  console.log("\nTOP 20 CATEGORII:");
  for (const r of results.slice(0, 20)) {
    console.log("  " + String(r.pullable).padStart(5) + " | " + r.main + " > " + r.leaf);
  }
  
  // Time estimate
  const totalPages = Math.ceil(grandTotal / 100);
  console.log("\n ESTIMARI TIMP:");
  console.log("  Total pagini listV2:     " + totalPages + " calls");
  console.log("  Timp pull produse:       ~" + Math.ceil(totalPages * 0.4 / 60) + " minute");
  console.log("  Timp shipping rates:     ~5 minute (240 calls)");
  console.log("  Timp enrichment (query): ~" + Math.ceil(grandTotal / 1000) + " zile (1000/zi)");
}

run().catch(console.error);
