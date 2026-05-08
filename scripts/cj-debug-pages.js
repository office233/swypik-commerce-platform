const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const API_KEY = "CJ5392130@api@42db7d6aa10b4c7e913623f4c9b69017";

async function run() {
  const authRes = await fetch(CJ_BASE + "/authentication/getAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: API_KEY }),
  });
  const auth = await authRes.json();
  const token = auth.data?.accessToken || auth.data;

  // Test: Woman Socks should have 5893 products
  const catId = "96EBD53A-C941-445C-BBBD-C1D9F858E433";
  
  // Check page 1
  console.log("=== WOMAN SOCKS TEST ===");
  const r1 = await fetch(CJ_BASE + "/product/listV2?categoryId=" + catId + "&page=1&size=200", {
    headers: { "CJ-Access-Token": token }
  });
  const j1 = await r1.json();
  console.log("Code:", j1.code, "Message:", j1.message || "OK");
  console.log("totalRecords:", j1.data?.totalRecords);
  console.log("content length:", j1.data?.content?.length);
  
  let totalItems = 0;
  if (j1.data?.content) {
    for (const g of j1.data.content) {
      totalItems += (g.productList || []).length;
    }
  }
  console.log("Products in page 1:", totalItems);
  
  // Check page 2
  await new Promise(r => setTimeout(r, 1100));
  const r2 = await fetch(CJ_BASE + "/product/listV2?categoryId=" + catId + "&page=2&size=200", {
    headers: { "CJ-Access-Token": token }
  });
  const j2 = await r2.json();
  let p2Items = 0;
  if (j2.data?.content) {
    for (const g of j2.data.content) {
      p2Items += (g.productList || []).length;
    }
  }
  console.log("Products in page 2:", p2Items);
  console.log("Page 2 code:", j2.code, j2.message || "OK");
  
  // Check page 3
  await new Promise(r => setTimeout(r, 1100));
  const r3 = await fetch(CJ_BASE + "/product/listV2?categoryId=" + catId + "&page=3&size=200", {
    headers: { "CJ-Access-Token": token }
  });
  const j3 = await r3.json();
  let p3Items = 0;
  if (j3.data?.content) {
    for (const g of j3.data.content) {
      p3Items += (g.productList || []).length;
    }
  }
  console.log("Products in page 3:", p3Items);
  console.log("Page 3 code:", j3.code, j3.message || "OK");
  
  // Also check how many we got via FIRST key
  await new Promise(r => setTimeout(r, 1100));
  const oldKey = "CJ4956855@api@de9a956925154416b295b771d2eb7a95";
  const oldAuth = await fetch(CJ_BASE + "/authentication/getAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: oldKey }),
  });
  const oldToken = (await oldAuth.json()).data?.accessToken;
  
  await new Promise(r => setTimeout(r, 1100));
  const r1old = await fetch(CJ_BASE + "/product/listV2?categoryId=" + catId + "&page=1&size=200", {
    headers: { "CJ-Access-Token": oldToken }
  });
  const j1old = await r1old.json();
  console.log("\n=== OLD KEY TEST ===");
  console.log("Code:", j1old.code, "Message:", (j1old.message || "OK").substring(0, 80));
  console.log("totalRecords:", j1old.data?.totalRecords);
}
run().catch(console.error);
