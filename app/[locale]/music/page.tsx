import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isEnabled } from "@/lib/feature-flags";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { languagesForMetadata } from "@/lib/seo/hreflang";
import { APP_URL } from "@/lib/app-url";
import MusicClient from "./MusicClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "meta" });
    const title = `${t("musicTitle")} | Swypik`;
    const description = t("musicDescription");
    const canonical = `${APP_URL}/music`;
    const languages = languagesForMetadata("/music");

    return {
        title,
        description,
        alternates: { canonical, languages },
        openGraph: {
            title,
            description,
            type: "website",
            url: canonical,
            siteName: "Swypik Music",
            locale: locale === "ro" ? "ro_RO" : locale,
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
        },
    };
}

export default function MusicPage() {
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "MusicPlaylist",
        name: "Swypik Music — Descoperă piese și artiști în vogă",
        url: `${APP_URL}/music`,
        description: "Streaming audio gratuit și melodii de top pe Swypik Music.",
        publisher: {
            "@type": "Organization",
            name: "Swypik",
            url: APP_URL,
        },
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
            />
            <MusicClient />
        </>
    );
}
