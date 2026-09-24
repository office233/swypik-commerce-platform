import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import CaresClient from "./CaresClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "cares" });
    return {
        title: t("metaTitle"),
        description: t("metaDescription"),
    };
}

export default function CaresPage() {
    return <CaresClient />;
}
