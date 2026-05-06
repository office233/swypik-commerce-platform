import { config } from "dotenv";
config({ path: ".env.local" });

const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

async function main() {
  // Get token
  const authRes = await fetch(CJ_BASE + "/authentication/getAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: process.env.CJ_API_KEY }),
  });
  const auth = await authRes.json();
  const token = auth.data?.accessToken || auth.data;
  console.log("Token:", token ? "OK" : "FAIL");

  // Wait 1.5s (rate limit)
  await new Promise(r => setTimeout(r, 1500));

  // Search dress
  const url = `${CJ_BASE}/product/listV2?page=1&size=5&keyWord=dress`;
  console.log("URL:", url);
  const res = await fetch(url, { headers: { "CJ-Access-Token": token } });
  const json = await res.json();
  
  // Log full structure
  console.log("\n=== FULL RESPONSE KEYS ===");
  console.log("code:", json.code);
  console.log("message:", json.message);
  console.log("data type:", typeof json.data);
  console.log("data keys:", json.data ? Object.keys(json.data) : "null");
  
  if (json.data?.list) {
    console.log("\n=== data.list ===");
    console.log("length:", json.data.list.length);
    if (json.data.list[0]) {
      console.log("First item keys:", Object.keys(json.data.list[0]));
      console.log("Title:", json.data.list[0].productNameEn);
      console.log("Price:", json.data.list[0].sellPrice);
    }
  } else if (Array.isArray(json.data)) {
    console.log("\n=== data is array ===");
    console.log("length:", json.data.length);
    if (json.data[0]) {
      console.log("First item keys:", Object.keys(json.data[0]));
      console.log("Title:", json.data[0].productNameEn);
    }
  } else {
    console.log("\ndata.list is missing! Full data:", JSON.stringify(json.data).substring(0, 500));
  }
}

main().catch(console.error);
