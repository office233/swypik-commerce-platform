import { getTranslations } from "next-intl/server";
import AppDetailClient from "./AppDetailClient";

export async function generateMetadata() {
  const t = await getTranslations("appDetail");
  return { title: `${t("metaTitle")} — Swypik App Store` };
}

export default async function AppDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <AppDetailClient slug={slug} />;
}
