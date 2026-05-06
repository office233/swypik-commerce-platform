const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const apiKey = "CJ4956855@api@de9a956925154416b295b771d2eb7a95";

async function run() {
  const authRes = await fetch(CJ_BASE + "/authentication/getAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey })
  });
  const auth = await authRes.json();
  const token = auth.data?.accessToken || auth.data;

  const res = await fetch(CJ_BASE + "/product/getCategory", {
    headers: { "CJ-Access-Token": token }
  });
  const json = await res.json();

  const women = (json.data || []).find(c => c.categoryFirstName === "Women's Clothing");
  if (!women) { console.log("Not found"); return; }

  console.log("WOMENS CLOTHING - FULL BREAKDOWN");
  console.log("=".repeat(60));

  const allCats = [];
  for (const sub of (women.categoryFirstList || [])) {
    console.log("\n" + sub.categorySecondName.toUpperCase());
    for (const cat of (sub.categorySecondList || [])) {
      allCats.push({ name: cat.categoryName, id: cat.categoryId, parent: sub.categorySecondName });
      console.log("  - " + cat.categoryName + "  [" + cat.categoryId + "]");
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Total sub-categorii: " + allCats.length);
  console.log("\nPRODUSE PER CATEGORIE:");
  console.log("=".repeat(60));

  for (const cat of allCats) {
    try {
      const url = CJ_BASE + "/product/listV2?categoryId=" + cat.id + "&page=1&size=1";
      const pRes = await fetch(url, { headers: { "CJ-Access-Token": token } });
      const pJson = await pRes.json();
      const total = pJson.data?.totalRecords || 0;
      console.log("  " + String(total).padStart(6) + " produse | " + cat.parent + " > " + cat.name);
    } catch (e) {
      console.log("  ERROR | " + cat.name);
    }
  }
}
run().catch(console.error);
