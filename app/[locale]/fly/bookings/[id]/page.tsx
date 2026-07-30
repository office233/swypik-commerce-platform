import { redirect } from "next/navigation";
import { dbQuery } from "@/lib/db";
import { getAuthUser } from "@/lib/auth/getAuthUser";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; locale: string }> };

const STATUS_LABEL: Record<string, string> = {
    pending: "În așteptarea plății",
    paid: "Plătit — se emite biletul",
    ticketed: "Bilet emis ✈️",
    failed: "Emitere eșuată — te contactăm",
    cancelled: "Anulat",
};

export default async function FlyBookingPage({ params }: Params) {
    const { id } = await params;
    const user = await getAuthUser();
    if (!user.userId) redirect(`/account?redirect=/fly/bookings/${id}`);

    const { rows } = await dbQuery<any>(
        `SELECT id::text, status, origin, destination, depart_date::text AS depart_date,
            return_date::text AS return_date, booking_ref, provider,
            total_cents::int8 AS total_cents, currency
       FROM flight_bookings WHERE id = $1 AND user_id = $2`,
        [id, user.userId],
    );
    const b = rows[0];
    if (!b) redirect("/fly");

    const total = new Intl.NumberFormat("ro-RO", { style: "currency", currency: b.currency }).format(
        Number(b.total_cents) / 100,
    );

    return (
        <div className="mx-auto max-w-lg px-4 pb-24 pt-8">
            <h1 className="text-xl font-bold">
                {b.origin} → {b.destination}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
                {b.depart_date}
                {b.return_date ? ` · retur ${b.return_date}` : ""}
            </p>

            <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-500">Status</span>
                    <span className="font-semibold">{STATUS_LABEL[b.status] ?? b.status}</span>
                </div>
                {b.booking_ref && (
                    <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm text-neutral-500">Cod rezervare (PNR)</span>
                        <span className="font-mono font-bold">{b.booking_ref}</span>
                    </div>
                )}
                <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm text-neutral-500">Total</span>
                    <span className="text-lg font-extrabold">{total}</span>
                </div>
            </div>

            {b.status === "ticketed" && (
                <a
                    href="/explore"
                    className="mt-4 block rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 p-4 text-white shadow"
                >
                    <p className="font-bold">10% reducere la mâncare 🍕</p>
                    <p className="text-sm opacity-90">Comandă prin Swypik în drum spre aeroport.</p>
                </a>
            )}
        </div>
    );
}
