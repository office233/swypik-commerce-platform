import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isEnabled } from "@/lib/feature-flags";
import MarketClient from "./MarketClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "crypto" });
  return { title: t("pageTitle"), description: t("pageDescription") };
}

export default function CryptoMarketPage() {
  if (!isEnabled("crypto")) notFound();
  return <MarketClient />;
}
