import { notFound } from "next/navigation";
import SquadClient from "./SquadClient";
import { isEnabled } from "@/lib/feature-flags";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Swypik Squad Buy — Cumperi cu prietenii, economisiți -30%",
    description: "Formează un Squad de 2 persoane și deblochează cel mai mic preț din România pe Swypik.",
};

export default function SquadPage() {
    if (!isEnabled("squadBuy")) notFound();
    return <SquadClient />;
}
