import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import SwypPublicClient from "./SwypPublicClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Moneda SWYP — transparență totală | Swypik",
    description:
        "Supply fix de 10 miliarde, trezorerie publică, blockchain propriu cu explorer public. Vezi datele live și verifică singur.",
};

export default async function SwypPublicPage() {
    // Doar pentru a valida namespace-ul pe server (client-ul folosește hooks).
    await getTranslations("swypPublic");
    return <SwypPublicClient />;
}
