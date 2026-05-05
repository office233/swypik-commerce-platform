import { NextResponse } from "next/server";
import { mockSearch } from "@/lib/mock-supplier";
import { filterProducts } from "@/lib/filter";
import { calculateSellPrice } from "@/lib/pricing";

export async function POST(req: Request) {
  const { message } = await req.json();

  const supplierProducts = mockSearch(message);
  const filtered = filterProducts(supplierProducts);

  const storeProducts = filtered.map((p) => {
    const cost = p.price + p.shipping + 5;
    const sellPrice = calculateSellPrice(cost);

    return {
      ...p,
      aiTitle: p.title,
      aiDescription: p.description,
      benefits: ["Calitate bună", "Raport preț excelent"],
      sellPrice,
      discountPercent: 30,
      marginPercent: 40,
      score: 1,
      dealLabel: "Best Deal",
    };
  });

  return NextResponse.json({
    reply: "Am găsit câteva produse bune pentru tine 👇",
    products: storeProducts,
  });
}
