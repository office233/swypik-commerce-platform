import { notFound } from "next/navigation";
import SquadClient from "./SquadClient";
import { isEnabled } from "@/lib/feature-flags";
import { SQUAD_DISCOUNT_PCT } from "@/lib/squad/config";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("sellerGrowthPublicSquad");
    return {
        title: t("metaTitle", { pct: SQUAD_DISCOUNT_PCT }),
        description: t("metaDescription"),
    };
}

export default function SquadPage() {
    if (!isEnabled("squadBuy")) notFound();
    return <SquadClient />;
}
