import SquadClient from "./SquadClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Swypik Squad Buy — Cumperi cu prietenii, economisiți -30%",
    description: "Formează un Squad de 2 persoane și deblochează cel mai mic preț din România pe Swypik.",
};

export default function SquadPage() {
    return <SquadClient />;
}
