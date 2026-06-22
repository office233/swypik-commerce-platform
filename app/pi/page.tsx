import PiFeedClient from "./PiFeedClient";
import type { PiShopProduct } from "./types";

// Pi-only marketplace home. Same catalog as the main site, but only Pi-safe
// fields, prices in Pi. No fiat, no external links.
async function getProducts(): Promise<PiShopProduct[]> {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com";
  try {
    const res = await fetch(`${base}/api/pi/products?limit=30`, {
      next: { revalidate: 120 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.products || []) as PiShopProduct[];
  } catch {
    return [];
  }
}

export default async function PiHomePage() {
  const products = await getProducts();
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-black">Shop with Pi</h1>
        <p className="text-xs text-white/50">Browse and pay with Pi</p>
      </div>
      <PiFeedClient products={products} />
    </div>
  );
}
