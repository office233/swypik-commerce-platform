import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getVertical, VERTICAL_CATALOG } from "@/lib/verticals/catalog";
import VerticalClient from "./VerticalClient";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return VERTICAL_CATALOG.map((v) => ({ id: v.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}): Promise<Metadata> {
  const { id, locale } = await params;
  const v = getVertical(id);
  if (!v) return { title: "Swypik" };
  const t = await getTranslations({ locale, namespace: "verticals" });
  const label = t(`${v.labelKey}.label`);
  return {
    title: `${v.brand} — ${label} | Swypik`,
    description: `${label} pe Swypik: descoperă prin video, comandă în câteva secunde.`,
  };
}

export default async function VerticalPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const vertical = getVertical(id);
  if (!vertical) notFound();

  return <VerticalClient vertical={vertical} />;
}
