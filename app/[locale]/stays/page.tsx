import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { staysConfig } from "@/lib/stays/config";
import StaysClient from "./StaysClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "staysUi" });
    return { title: t("metaTitle"), description: t("metaDescription") };
}

export default function StaysPage() {
    return <StaysClient maxNights={staysConfig.maxNights()} maxGuests={staysConfig.maxGuests()} />;
}
