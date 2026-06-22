import { notFound } from "next/navigation";
import type { PiShopProduct } from "../../types";
import PiProductClient from "./PiProductClient";

async function getProduct(id: string): Promise<PiShopProduct | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com";
  try {
    const res = await fetch(`${base}/api/pi/products?id=${encodeURIComponent(id)}`, {
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.product as PiShopProduct) || null;
  } catch {
    return null;
  }
}

export default async function PiProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();
  return <PiProductClient product={product} />;
}
