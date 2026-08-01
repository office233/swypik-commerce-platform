/**
 * Admin Aplicații — COADA UNIFICATĂ de cereri de partener.
 *
 * Agregă toate cele 5 surse într-o singură listă cronologică:
 *   - șoferi/curieri (couriers)          → acțiuni în /admin/fleet
 *   - francize (fleet_partners)          → /admin/fleet
 *   - vânzători (sellers)                → /admin/sellers
 *   - gazde Stays (host_applications)    → /admin/hosts
 *   - creatori (creator_applications)    → /admin/applications
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Car, Bike, Building2, Store, Home, Clapperboard, type LucideIcon } from "lucide-react";
import { dbQuery } from "@/lib/db";
import { requireAdminSession } from "@/lib/security/admin-auth";

export const dynamic = "force-dynamic";

type UnifiedApp = {
    source: string;
    id: string;
    name: string;
    detail: string;
    city: string | null;
    status: string;
    created_at: string;
};

const SOURCE_META: Record<string, { label: string; Icon: LucideIcon; color: string; href: string }> = {
    driver: { label: "Șofer Go", Icon: Car, color: "bg-amber-100 text-amber-700", href: "/admin/fleet" },
    courier: { label: "Curier Food", Icon: Bike, color: "bg-green-100 text-green-700", href: "/admin/fleet" },
    franchise: { label: "Franciză", Icon: Building2, color: "bg-purple-100 text-purple-700", href: "/admin/fleet" },
    seller: { label: "Vânzător", Icon: Store, color: "bg-violet-100 text-violet-700", href: "/admin/sellers" },
    host: { label: "Gazdă Stays", Icon: Home, color: "bg-teal-100 text-teal-700", href: "/admin/hosts" },
    creator: { label: "Creator", Icon: Clapperboard, color: "bg-pink-100 text-pink-700", href: "/admin/applications" },
};

const PENDING_STATUSES = new Set(["pending", "submitted", "in_review", "needs_info"]);

const STATUS_BADGE: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    submitted: "bg-amber-100 text-amber-700",
    in_review: "bg-sky-100 text-sky-700",
    needs_info: "bg-orange-100 text-orange-700",
    approved: "bg-green-100 text-green-700",
    active: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-600",
    suspended: "bg-gray-200 text-gray-600",
};

function fmt(d: string): string {
    try {
        return new Date(d).toLocaleDateString("ro-RO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch { return "-"; }
}

async function loadAll(): Promise<UnifiedApp[]> {
    const safe = async (sql: string): Promise<UnifiedApp[]> => {
        try {
            const { rows } = await dbQuery<UnifiedApp>(sql);
            return rows;
        } catch { return []; }
    };

    const [couriers, franchises, sellers, hosts, creators] = await Promise.all([
        safe(`SELECT kind AS source, id::text, full_name AS name,
             CONCAT(vehicle_type, COALESCE(' · ' || vehicle_plate, ''), ' · ', phone) AS detail,
             city, verification_status AS status, created_at::text
        FROM couriers ORDER BY created_at DESC LIMIT 100`),
        safe(`SELECT 'franchise' AS source, id::text, company_name AS name,
             CONCAT(COALESCE(contact_name, ''), ' · ', phone, ' · ', vertical) AS detail,
             city, status, created_at::text
        FROM fleet_partners ORDER BY created_at DESC LIMIT 50`),
        safe(`SELECT 'seller' AS source, id::text, COALESCE(name, email) AS name,
             CONCAT(COALESCE(cui, '—'), ' · ', COALESCE(product_type, '')) AS detail,
             NULL AS city, status, created_at::text
        FROM sellers ORDER BY created_at DESC LIMIT 50`),
        safe(`SELECT 'host' AS source, id::text, property_name AS name,
             CONCAT(property_type, ' · ', rooms, ' camere · ', full_name) AS detail,
             city, status, created_at::text
        FROM host_applications ORDER BY created_at DESC LIMIT 50`),
        safe(`SELECT 'creator' AS source, ca.id::text, ca.requested_handle AS name,
             COALESCE(u.display_name, u.username, '') AS detail,
             NULL AS city, ca.status, ca.created_at::text
        FROM creator_applications ca LEFT JOIN users u ON u.id = ca.user_id
       ORDER BY ca.created_at DESC LIMIT 50`),
    ]);

    return [...couriers, ...franchises, ...sellers, ...hosts, ...creators]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export default async function AdminAplicatiiPage({
    searchParams,
}: {
    searchParams: Promise<{ f?: string }>;
}) {
    const t = await getTranslations("adminApplications");
    await requireAdminSession();
    const { f } = await searchParams;
    const all = await loadAll();
    const pendingCount = all.filter((a) => PENDING_STATUSES.has(a.status)).length;
    const items = f === "pending" ? all.filter((a) => PENDING_STATUSES.has(a.status)) : all;

    return (
        <div className="p-6">
            <div className="mb-6 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-black text-[#0D0D0D]">{t("partnersTitle")}</h1>
                {pendingCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700">
                        {pendingCount} în așteptare
                    </span>
                )}
                <div className="ml-auto flex gap-2">
                    <Link
                        href="/admin/aplicatii"
                        className={`rounded-full px-4 py-1.5 text-[13px] font-bold ${!f ? "bg-black text-white" : "bg-gray-100 text-gray-600"}`}
                    >
                        Toate ({all.length})
                    </Link>
                    <Link
                        href="/admin/aplicatii?f=pending"
                        className={`rounded-full px-4 py-1.5 text-[13px] font-bold ${f === "pending" ? "bg-black text-white" : "bg-gray-100 text-gray-600"}`}
                    >
                        În așteptare ({pendingCount})
                    </Link>
                </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
                <table className="w-full text-left text-[13px]">
                    <thead className="border-b border-black/10 text-[11px] uppercase tracking-wide text-[#6E6E80]">
                        <tr>
                            <th className="px-4 py-3">Tip</th>
                            <th className="px-4 py-3">Nume</th>
                            <th className="px-4 py-3">Detalii</th>
                            <th className="px-4 py-3">{t("thCity")}</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">{t("thReceived")}</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((a) => {
                            const meta = SOURCE_META[a.source] ?? SOURCE_META.creator;
                            return (
                                <tr key={`${a.source}-${a.id}`} className="border-b border-black/5 last:border-0 hover:bg-gray-50/50">
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.color}`}>
                                            <meta.Icon size={12} /> {meta.label}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 font-bold">{a.name}</td>
                                    <td className="max-w-[280px] truncate px-4 py-3 text-[#6E6E80]">{a.detail}</td>
                                    <td className="px-4 py-3">{a.city ?? "—"}</td>
                                    <td className="px-4 py-3">
                                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_BADGE[a.status] ?? "bg-gray-100 text-gray-600"}`}>
                                            {a.status}
                                        </span>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-[#6E6E80]">{fmt(a.created_at)}</td>
                                    <td className="px-4 py-3">
                                        <Link href={meta.href} className="font-bold text-violet-600 hover:underline">
                                            Procesează →
                                        </Link>
                                    </td>
                                </tr>
                            );
                        })}
                        {items.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-10 text-center text-[#A1A1AA]">
                                    Nicio aplicație {f === "pending" ? "în așteptare" : "încă"}. Cererile noi apar aici automat.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
