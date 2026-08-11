import type { Metadata } from "next";
import CaresClient from "./CaresClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Swypik Cares — donații transparente pentru cauze verificate",
    description:
        "Susține cauze locale verificate: ONG-uri, familii, comunități. Fiecare leu donat e urmărit transparent, cu plăți și dovezi publice.",
};

export default function CaresPage() {
    return <CaresClient />;
}
