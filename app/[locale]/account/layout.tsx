import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageMeta.account");
  return {
    title: t("title") + " — Swypik",
    description: t("description"),
  };
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
