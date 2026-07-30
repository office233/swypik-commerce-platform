import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { dbQuery } from "@/lib/db";
import MenuClient from "./MenuClient";

export const dynamic = "force-dynamic";

async function getMerchant(slug: string) {
  const { rows } = await dbQuery(
    `SELECT id, name, slug, description, cuisine_types, phone, address,
            location_city, delivery_fee_cents, min_order_cents, avg_prep_minutes,
            opening_hours, is_open_override, rating, image_url, status
       FROM local_merchants WHERE slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const m = await getMerchant(slug);
  if (!m) return { title: "Swypik Food" };
  return {
    title: `${m.name} — comandă online | Swypik Food`,
    description: m.description ?? `Comandă de la ${m.name} prin Swypik Food. Livrare rapidă.`,
  };
}

export default async function MerchantMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const merchant = await getMerchant(slug);
  if (!merchant || merchant.status !== "active") notFound();

  return <MenuClient merchant={JSON.parse(JSON.stringify(merchant))} />;
}
