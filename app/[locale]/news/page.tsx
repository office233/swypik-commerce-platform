import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isEnabled } from "@/lib/feature-flags";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import NewsListClient from "./NewsListClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "news" });
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
      type: "website",
    },
    alternates: { canonical: `/${locale}/news` },
  };
}

export default async function NewsFeedPage() {
  if (!isEnabled("news")) notFound();
  const user = await getAuthUser();
  return <NewsListClient isAdmin={user.isAdmin} />;
}
