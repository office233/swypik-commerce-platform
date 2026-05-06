const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const API_KEY = "CJ4956855@api@de9a956925154416b295b771d2eb7a95";

// Key countries for EU/global marketplace
const TEST_COUNTRIES = [
  "RO", "DE", "FR", "IT", "ES", "NL", "BE", "AT", "PL", "CZ",
  "HU", "BG", "HR", "GR", "PT", "SE", "DK", "FI", "IE", "SK",
  "US", "CA", "UK", "AU", "BR", "MX", "JP", "KR", "IN", "SA",
  "AE", "IL", "TR", "ZA", "NG", "EG"
];

async function run() {
  const authRes = await fetch(CJ_BASE + "/authentication/getAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: API_KEY }),
  });
  const auth = await authRes.json();
  const token = auth.data?.accessToken || auth.data;

  // Use a real product variant
  const pid = "1398816627469979648";
  const res = await fetch(CJ_BASE + "/product/query?pid=" + pid, {
    headers: { "CJ-Access-Token": token }
  });
  const json = await res.json();
  const vid = json.data?.variants?.[0]?.vid;
  
  console.log("Produs: " + (json.data?.productNameEn || "Phone case"));
  console.log("VID: " + vid);
  console.log("Weight: " + json.data?.productWeight + "g");
  console.log("Packing weight: " + json.data?.packingWeight + "g");
  console.log("");
  console.log("=".repeat(85));
  console.log("TARA".padEnd(5) + "METODA CEL MAI IEFTIN".padEnd(30) + "SHIP $".padEnd(10) + "TOTAL $".padEnd(10) + "ZILE".padEnd(10) + "NR METODE");
  console.log("=".repeat(85));
  
  let available = 0;
  let notAvailable = [];
  
  for (const country of TEST_COUNTRIES) {
    // Rate limit - 1 req/sec
    await new Promise(r => setTimeout(r, 1100));
    
    try {
      const shipRes = await fetch(CJ_BASE + "/logistic/freightCalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
        body: JSON.stringify({
          startCountryCode: "CN",
          endCountryCode: country,
          products: [{ quantity: 1, vid: vid }]
        })
      });
      const ship = await shipRes.json();
      
      if (ship.data && Array.isArray(ship.data) && ship.data.length > 0) {
        // Find cheapest
        const cheapest = ship.data.reduce((min, s) => 
          (s.logisticPrice || 999) < (min.logisticPrice || 999) ? s : min
        , ship.data[0]);
        
        console.log(
          country.padEnd(5) +
          (cheapest.logisticName || "?").padEnd(30) +
          ("$" + (cheapest.logisticPrice || "?")).padEnd(10) +
          ("$" + (cheapest.totalPostageFee || "?")).padEnd(10) +
          (cheapest.logisticAging || "?").toString().padEnd(10) +
          ship.data.length + " metode"
        );
        available++;
      } else {
        notAvailable.push(country);
      }
    } catch (e) {
      // Rate limited, retry
      await new Promise(r => setTimeout(r, 2000));
      notAvailable.push(country + "(err)");
    }
  }
  
  console.log("\n" + "=".repeat(85));
  console.log("Livreaza in: " + available + "/" + TEST_COUNTRIES.length + " tari testate");
  if (notAvailable.length > 0) {
    console.log("NU livreaza in: " + notAvailable.join(", "));
  }
}

run().catch(console.error);
