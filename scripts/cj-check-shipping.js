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

  // 1. Get a product with full details
  const pid = "1398816627469979648"; // phone case
  const res = await fetch(CJ_BASE + "/product/query?pid=" + pid, {
    headers: { "CJ-Access-Token": token }
  });
  const json = await res.json();
  const p = json.data || {};
  
  console.log("=== PRODUS: " + (p.productNameEn || p.nameEn || "?") + " ===");
  console.log("Warehouse stock:", p.warehouseInventoryNum);
  
  // Show ALL keys that contain "warehouse" or "ship" or "country" or "logistic"
  console.log("\n--- Campuri relevante livrare ---");
  for (const key of Object.keys(p)) {
    const kl = key.toLowerCase();
    if (kl.includes("warehouse") || kl.includes("ship") || kl.includes("country") || 
        kl.includes("logistic") || kl.includes("origin") || kl.includes("location") ||
        kl.includes("stock") || kl.includes("inventory") || kl.includes("source")) {
      const val = p[key];
      if (val !== null && val !== undefined && val !== "") {
        console.log("  " + key + ":", typeof val === "object" ? JSON.stringify(val).substring(0, 200) : val);
      }
    }
  }
  
  // 2. Get variant info
  const variants = p.variants || [];
  if (variants[0]) {
    const v = variants[0];
    const vid = v.vid;
    console.log("\n--- Variant VID:", vid, "---");
    
    // Show variant warehouse/location fields
    for (const key of Object.keys(v)) {
      const kl = key.toLowerCase();
      if (kl.includes("warehouse") || kl.includes("ship") || kl.includes("country") || 
          kl.includes("logistic") || kl.includes("stock") || kl.includes("inventory")) {
        console.log("  " + key + ":", v[key]);
      }
    }

    // 3. Check shipping to Romania
    console.log("\n=== SHIPPING CHINA -> ROMANIA ===");
    const shipRes = await fetch(CJ_BASE + "/logistic/freightCalculate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
      body: JSON.stringify({ startCountryCode: "CN", endCountryCode: "RO", products: [{ quantity: 1, vid: vid }] })
    });
    const ship = await shipRes.json();
    if (ship.data && Array.isArray(ship.data)) {
      for (const s of ship.data) {
        console.log("  " + (s.logisticName || "?").padEnd(25) + " | $" + String(s.logisticPrice || "?").padEnd(6) + " | " + (s.logisticAging || "?") + " zile | total: $" + (s.totalPostageFee || "?"));
      }
    }
    
    // 4. Check if ships from OTHER warehouses (US, EU)
    console.log("\n=== SHIPPING US -> ROMANIA ===");
    const shipUS = await fetch(CJ_BASE + "/logistic/freightCalculate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
      body: JSON.stringify({ startCountryCode: "US", endCountryCode: "RO", products: [{ quantity: 1, vid: vid }] })
    });
    const shipUSJson = await shipUS.json();
    if (shipUSJson.data && Array.isArray(shipUSJson.data)) {
      for (const s of shipUSJson.data) {
        console.log("  " + (s.logisticName || "?").padEnd(25) + " | $" + String(s.logisticPrice || "?").padEnd(6) + " | " + (s.logisticAging || "?") + " zile");
      }
    } else {
      console.log("  Nu livreaza din US:", shipUSJson.message || "no data");
    }

    console.log("\n=== SHIPPING DE (Germania) -> ROMANIA ===");
    const shipDE = await fetch(CJ_BASE + "/logistic/freightCalculate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
      body: JSON.stringify({ startCountryCode: "DE", endCountryCode: "RO", products: [{ quantity: 1, vid: vid }] })
    });
    const shipDEJson = await shipDE.json();
    if (shipDEJson.data && Array.isArray(shipDEJson.data)) {
      for (const s of shipDEJson.data) {
        console.log("  " + (s.logisticName || "?").padEnd(25) + " | $" + String(s.logisticPrice || "?").padEnd(6) + " | " + (s.logisticAging || "?") + " zile");
      }
    } else {
      console.log("  Nu livreaza din DE:", shipDEJson.message || "no data");
    }
  }
  
  // 5. Check CJ storage/warehouse info
  console.log("\n=== CJ WAREHOUSES ===");
  const whRes = await fetch(CJ_BASE + "/storage/info", {
    headers: { "CJ-Access-Token": token }
  });
  const whJson = await whRes.json();
  console.log("Warehouses:", JSON.stringify(whJson.data || whJson, null, 2).substring(0, 1000));
}

run().catch(console.error);
