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

  // Try different categories to find products with video
  const searches = ["led lamp", "kitchen gadget", "phone holder car", "bluetooth speaker", "drone camera"];
  
  for (const kw of searches) {
    await new Promise(r => setTimeout(r, 1100));
    const url = CJ_BASE + "/product/listV2?keyWord=" + encodeURIComponent(kw) + "&page=1&size=50";
    const res = await fetch(url, { headers: { "CJ-Access-Token": token } });
    const json = await res.json();
    
    let withVideo = 0;
    let total = 0;
    let videoProduct = null;
    
    for (const group of (json.data?.content || [])) {
      for (const p of (group.productList || [])) {
        total++;
        if (p.isVedio === 1 || p.isVideo === 1) {
          withVideo++;
          if (!videoProduct) videoProduct = p;
        }
      }
    }
    console.log(kw.padEnd(25) + "| " + total + " total | " + withVideo + " with video (" + Math.round(withVideo/total*100) + "%)");
    
    if (videoProduct) {
      console.log("  FOUND: " + videoProduct.nameEn?.substring(0, 60));
      console.log("  videoList:", JSON.stringify(videoProduct.videoList));
      
      // Get detail
      await new Promise(r => setTimeout(r, 1100));
      const dRes = await fetch(CJ_BASE + "/product/query?pid=" + videoProduct.id, {
        headers: { "CJ-Access-Token": token }
      });
      const d = (await dRes.json()).data || {};
      console.log("  productVideo:", d.productVideo);
      console.log("  videoUrl:", d.videoUrl || d.video || "N/A");
      
      for (const key of Object.keys(d)) {
        if (key.toLowerCase().includes("video") || key.toLowerCase().includes("vedio")) {
          const val = d[key];
          if (val !== null && val !== undefined) {
            console.log("  " + key + ": " + JSON.stringify(val).substring(0, 200));
          }
        }
      }
    }
  }
}
run().catch(console.error);
