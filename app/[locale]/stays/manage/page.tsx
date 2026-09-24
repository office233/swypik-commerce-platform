import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import HostPanelClient from "./HostPanelClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "stays" });
    return {
        title: t("manageMetaTitle"),
        description: t("manageMetaDescription"),
    };
}

export default function HostPanelPage() {
    return <HostPanelClient />;
}
