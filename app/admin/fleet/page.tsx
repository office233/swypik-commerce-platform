/**
 * Admin Fleet — verificarea aplicațiilor de șoferi (Go) și curieri (Food)
 * + lista francizelor de flotă.
 */
import { dbQuery } from "@/lib/db";
import { requireAdminSession } from "@/lib/security/admin-auth";
import FleetActions, { PartnerActions } from "./FleetActions";

export const dynamic = "force-dynamic";

type CourierRow = {
    id: string;
    kind: string;
    full_name: string;
    phone: string;
    email: string | null;
    city: string;
    vehicle_type: string;
    vehicle_plate: string | null;
    verification_status: string;
    active: boolean;
    fleet_partner_id: string | null;
    created_at: string;
    // Cont + telemetrie
    user_id: string | null;
    login_email: string | null;
    is_online: boolean;
    current_lat: number | null;
    current_lng: number | null;
    location_updated_at: string | null;
    last_ip: string | null;
    last_seen_at: string | null;
};

type PartnerRow = {
    id: string;
    company_name: string;
    city: string;
    vertical: string;
    status: string;
    phone: string;
    driver_count: number;
};

const STATUS_BADGE: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-600",
};

export default async function AdminFleetPage() {
    await requireAdminSession();

    const [{ rows: couriers }, { rows: partners }] = await Promise.all([
        dbQuery<CourierRow>(
                        `SELECT c.id, c.kind, c.full_name, c.phone, c.email, c.city, c.vehicle_type, c.vehicle_plate,
                            c.verification_status, c.active, c.fleet_partner_id, c.created_at,
                            c.user_id::text, u.email AS login_email, c.is_online,
                            c.current_lat, c.current_lng, c.location_updated_at::text,
                                s.ip_address::text AS last_ip, s.last_seen_at
                 FROM couriers c
                 LEFT JOIN users u ON u.id = c.user_id
                 LEFT JOIN LATERAL (
                                SELECT ip_address, COALESCE(last_seen_at, created_at)::text AS last_seen_at
                                FROM user_sessions
                             WHERE user_id = c.user_id
                                ORDER BY COALESCE(last_seen_at, created_at) DESC
                             LIMIT 1
                 ) s ON true
                ORDER BY (c.verification_status = 'pending') DESC, c.created_at DESC
        LIMIT 100`,
        ),
        dbQuery<PartnerRow>(
            `SELECT fp.id, fp.company_name, fp.city, fp.vertical, fp.status, fp.phone,
              COUNT(c.id)::int AS driver_count
         FROM fleet_partners fp
         LEFT JOIN couriers c ON c.fleet_partner_id = fp.id
        GROUP BY fp.id
        ORDER BY fp.created_at DESC
        LIMIT 50`,
        ),
    ]);

    const pending = couriers.filter((c) => c.verification_status === "pending");
    const activeCount = couriers.filter((c) => c.verification_status === "approved" && c.active).length;
    const inactiveCount = couriers.filter((c) => c.verification_status === "approved" && !c.active).length;
    const rejectedCount = couriers.filter((c) => c.verification_status === "rejected").length;

    return (
        <div className="p-6">
            <h1 className="text-2xl font-black text-[#0D0D0D]">
                Flotă — verificări{" "}
                {pending.length > 0 && (
                    <span className="ml-2 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700">
                        {pending.length} în așteptare
                    </span>
                )}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-bold">
                <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">{activeCount} activi</span>
                <span className="rounded-full bg-gray-200 px-3 py-1 text-gray-600">{inactiveCount} suspendați</span>
                <span className="rounded-full bg-red-100 px-3 py-1 text-red-600">{rejectedCount} respinși</span>
                <span className="rounded-full bg-black/5 px-3 py-1 text-[#6E6E80]">{couriers.length} total</span>
            </div>

            <section className="mt-6">
                <h2 className="mb-3 text-lg font-extrabold">Aplicații șoferi & curieri</h2>
                <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
                    <table className="w-full text-left text-[13px]">
                        <thead className="border-b border-black/10 text-[11px] uppercase tracking-wide text-[#6E6E80]">
                            <tr>
                                <th className="px-4 py-3">Nume</th>
                                <th className="px-4 py-3">Tip</th>
                                <th className="px-4 py-3">Contact</th>
                                <th className="px-4 py-3">Cont login</th>
                                <th className="px-4 py-3">Oraș</th>
                                <th className="px-4 py-3">Vehicul</th>
                                <th className="px-4 py-3">Locație / IP</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody>
                            {couriers.map((c) => (
                                <tr key={c.id} className="border-b border-black/5 last:border-0">
                                    <td className="px-4 py-3 font-bold">{c.full_name}</td>
                                    <td className="px-4 py-3">{c.kind === "driver" ? "🚕 Go" : "🛵 Food"}</td>
                                    <td className="px-4 py-3">
                                        {c.phone}
                                        {c.email && <span className="block text-[11px] text-[#A1A1AA]">{c.email}</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        {c.user_id ? (
                                            <>
                                                <span className="text-[12px] font-medium">{c.login_email ?? "—"}</span>
                                                <span className="block font-mono text-[10px] text-[#A1A1AA]" title="user_id">{c.user_id.slice(0, 8)}…</span>
                                            </>
                                        ) : (
                                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700" title="Aplicație trimisă fără cont — se leagă la primul login">
                                                fără cont
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">{c.city}</td>
                                    <td className="px-4 py-3">
                                        {c.vehicle_type}
                                        {c.vehicle_plate && <span className="block text-[11px] text-[#A1A1AA]">{c.vehicle_plate}</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        {c.current_lat !== null && c.current_lng !== null ? (
                                            <a
                                                href={`https://www.openstreetmap.org/?mlat=${c.current_lat}&mlon=${c.current_lng}#map=16/${c.current_lat}/${c.current_lng}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-[12px] font-medium text-sky-600 underline"
                                                title={c.location_updated_at ? `actualizat: ${c.location_updated_at}` : undefined}
                                            >
                                                {c.is_online ? "🟢" : "⚪"} {Number(c.current_lat).toFixed(4)}, {Number(c.current_lng).toFixed(4)}
                                            </a>
                                        ) : (
                                            <span className="text-[11px] text-[#A1A1AA]">{c.is_online ? "🟢 online, fără GPS" : "— fără locație"}</span>
                                        )}
                                        {c.last_ip && (
                                            <span className="block font-mono text-[10px] text-[#A1A1AA]" title={c.last_seen_at ? `ultima sesiune: ${c.last_seen_at}` : undefined}>
                                                IP {c.last_ip}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_BADGE[c.verification_status] ?? "bg-gray-100 text-gray-600"}`}>
                                            {c.verification_status}
                                        </span>
                                        {!c.active && c.verification_status === "approved" && (
                                            <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">suspendat</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <FleetActions
                                            courierId={c.id}
                                            status={c.verification_status}
                                            active={c.active}
                                            partners={partners.filter((p) => p.status === "active" && p.city.toLowerCase() === c.city.toLowerCase())}
                                        />
                                    </td>
                                </tr>
                            ))}
                            {couriers.length === 0 && (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-[#A1A1AA]">Nicio aplicație încă.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="mt-10">
                <h2 className="mb-3 text-lg font-extrabold">Francize de flotă</h2>
                <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
                    <table className="w-full text-left text-[13px]">
                        <thead className="border-b border-black/10 text-[11px] uppercase tracking-wide text-[#6E6E80]">
                            <tr>
                                <th className="px-4 py-3">Firmă</th>
                                <th className="px-4 py-3">Oraș</th>
                                <th className="px-4 py-3">Vertical</th>
                                <th className="px-4 py-3">Șoferi</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody>
                            {partners.map((p) => (
                                <tr key={p.id} className="border-b border-black/5 last:border-0">
                                    <td className="px-4 py-3 font-bold">{p.company_name}<span className="block text-[11px] font-normal text-[#A1A1AA]">{p.phone}</span></td>
                                    <td className="px-4 py-3">{p.city}</td>
                                    <td className="px-4 py-3">{p.vertical === "both" ? "Go + Food" : p.vertical === "go" ? "🚕 Go" : "🛵 Food"}</td>
                                    <td className="px-4 py-3">{p.driver_count}</td>
                                    <td className="px-4 py-3">
                                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${p.status === "active" ? "bg-green-100 text-green-700" : STATUS_BADGE[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                                            {p.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <PartnerActions partnerId={p.id} status={p.status} />
                                    </td>
                                </tr>
                            ))}
                            {partners.length === 0 && (
                                <tr><td colSpan={6} className="px-4 py-8 text-center text-[#A1A1AA]">Nicio franciză încă. Aplicațiile vin din /join/franchise.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
