import { notFound } from "next/navigation";
import { dbQuery } from "@/lib/db";
import StayDetailClient from "./StayDetailClient";

export const dynamic = "force-dynamic";

type Row = {
    id: string;
    title: string;
    description: string | null;
    image_url: string | null;
    price_cents: number | null;
    location_city: string | null;
    max_guests: number | null;
    property_type: string | null;
};

export default async function StayDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

    const { rows } = await dbQuery<Row>(
        `SELECT id::text, title, description, image_url, price_cents, location_city,
                (metadata->>'max_guests')::int AS max_guests,
                metadata->>'property_type' AS property_type
           FROM marketplace_products
          WHERE id = $1::uuid AND listing_type = 'listing' AND status = 'active'
            AND (metadata->>'vertical' = 'stays' OR taxonomy_node_slug LIKE 'vacation-rentals%')`,
        [id],
    );
    const stay = rows[0];
    if (!stay) notFound();

    return <StayDetailClient stay={stay} />;
}
