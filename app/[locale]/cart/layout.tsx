import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageMeta.cart");
  return {
    title: t("title") + " — Swypik",
    description: t("description"),
  };
}

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
