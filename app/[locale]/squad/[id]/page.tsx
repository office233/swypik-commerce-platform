import SquadDetailClient from "./SquadDetailClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Alătură-te Squad-ului — Reducere 30% pe Swypik",
    description: "Cumpără împreună cu un prieten și deblochează reducerea de grup pe Swypik.",
};

export default async function SquadDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <SquadDetailClient squadId={id} />;
}
