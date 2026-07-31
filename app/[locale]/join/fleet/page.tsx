import { Suspense } from "react";
import FleetApplyClient from "./FleetApplyClient";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ kind?: string }> }): Promise<Metadata> {
    const { kind } = await searchParams;
    const isGo = kind === "driver";
    return isGo
        ? {
            title: "Devino șofer Swypik Go — 0% comision 60 de zile | Swypik",
            description:
                "Câștigă din curse în orașul tău cu cel mai mic comision din România: 0% primele 60 de zile, apoi 15% pe viață pentru primii 500 de șoferi. Plăți săptămânale, program flexibil, fără dispecerat.",
        }
        : {
            title: "Devino curier Swypik Food — plată pe livrare + bonusuri | Swypik",
            description:
                "Livrează mâncare în cartierul tău pe bicicletă, scuter sau mașină. Tarif corect pe livrare, bonusuri la orele de vârf, program 100% flexibil. Înscrie-te în 2 minute.",
        };
}

export default function FleetJoinPage() {
    return (
        <Suspense fallback={null}>
            <FleetApplyClient />
        </Suspense>
    );
}
