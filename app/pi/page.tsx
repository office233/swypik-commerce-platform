import PiFeedClient from "./PiFeedClient";
import { getPiToRonRate } from "@/lib/pi/rate";

// Pi-only marketplace home. Server-fetches the first page of products from the
// same catalog the main site uses, then hands off to the client for browsing +
// Pi checkout. No fiat surfaces, no external links.
async function getProducts() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com";
  try {
    const res = await fetch(`${base}/api/products?limit=24`, {
      next: { revalidate: 120 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.products || data.items || []) as PiProduct[];
  } catch {
    return [];
  }
}

export type PiProduct = {
  id: string;
  title: string;
  price: number; // RON
  images?: string[];
  category?: string;
};

export default async function PiHomePage() {
  const products = await getProducts();
  // Live market rate for display. If it's unavailable we still render the
  // catalog; the client shows "—" and Buy re-quotes server-side at pay time.
  let piToRon = 0;
  try {
    piToRon = await getPiToRonRate();
  } catch {
    piToRon = 0;
  }
  return <PiFeedClient products={products} piToRon={piToRon} />;
}
