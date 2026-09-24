import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
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
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const t = await getTranslations({ locale, namespace: "food" });
  const m = await getMerchant(slug);
  if (!m) return { title: "Swypik Food" };
  return {
    title: `${m.name} — ${t("meta.orderOnline")} | Swypik Food`,
    description: m.description ?? t("meta.merchantDescription", { name: m.name }),
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
