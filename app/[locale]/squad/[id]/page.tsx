import { notFound } from "next/navigation";
import SquadDetailClient from "./SquadDetailClient";
import { isEnabled } from "@/lib/feature-flags";
import { SQUAD_DISCOUNT_PCT } from "@/lib/squad/config";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("sellerGrowthPublicSquad");
    return {
        title: t("detailMetaTitle", { pct: SQUAD_DISCOUNT_PCT }),
        description: t("detailMetaDescription"),
    };
}

export default async function SquadDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    if (!isEnabled("squadBuy")) notFound();
    const { id } = await params;
    return <SquadDetailClient squadId={id} />;
}
