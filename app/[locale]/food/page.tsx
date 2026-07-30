import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import FoodClient from "./FoodClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "verticals" });
  return {
    title: `Swypik Food — ${t("eats.label")} | Livrare rapidă`,
    description:
      "Comandă mâncare de la restaurantele din orașul tău. Vezi preparatele în video, comandă într-un tap.",
  };
}

export default function FoodPage() {
  return <FoodClient />;
}
