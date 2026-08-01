/**
 * Admin — coada de aprobare gazde Swypik Stays.
 * Verificăm: dreptul asupra proprietății, certificatul de clasificare
 * (pensiuni/hoteluri) și conformitatea fiscală înainte de publicare.
 */
import Link from "next/link";
import { Check, X } from "lucide-react";
import { dbQuery } from "@/lib/db";
import { requireAdminSession } from "@/lib/security/admin-auth";
import { decryptCnp, maskCnp } from "@/lib/identity/cnp";
import HostActions from "./HostActions";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
    pending: "În așteptare",
    needs_info: "Așteaptă documente",
    approved: "Aprobată",
    rejected: "Respinsă",
};

const STATUS_COLOR: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    needs_info: "bg-sky-100 text-sky-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
};

const ENTITY_LABELS: Record<string, string> = {
    persoana_fizica: "Persoană fizică",
    pfa: "PFA / ÎI",
    srl: "SRL",
};

type Row = {
    id: string;
    status: string;
    full_name: string;
    phone: string;
    email: string;
    entity_type: string;
    company_name: string | null;
    cui: string | null;
    property_name: string;
    property_type: string;
    address: string;
    city: string;
    county: string;
    rooms: number;
    max_guests: number;
    classification_cert: string | null;
    tourism_registered: boolean;
    cnp_encrypted: string | null;
    admin_notes: string | null;
    created_at: string;
};

/** CNP-ul se afișează DOAR mascat: prima + ultimele 4 cifre. */
function maskedCnpOf(row: Row): string | null {
    if (!row.cnp_encrypted) return null;
    try {
        return maskCnp(decryptCnp(row.cnp_encrypted));
    } catch {
        return "eroare decriptare";
    }
}

function fmtDate(d: string | null): string {
    if (!d) return "-";
    try {
        return new Date(d).toLocaleDateString("ro-RO", {
            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
    } catch {
        return "-";
    }
}

const TABS = ["pending", "needs_info", "approved", "rejected", "all"] as const;

export default async function AdminHostsPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string }>;
}) {
    await requireAdminSession();
    const sp = await searchParams;
    const status = (TABS as readonly string[]).includes(sp.status || "") ? sp.status! : "pending";

    let rows: Row[] = [];
    let loadError: string | null = null;
    try {
        const params: any[] = [];
        let whereSql = "";
        if (status !== "all") {
            params.push(status);
            whereSql = "WHERE status = $1";
        }
        const res = await dbQuery<Row>(
            `SELECT id, status, full_name, phone, email, entity_type, company_name, cui,
                    property_name, property_type, address, city, county, rooms, max_guests,
                    classification_cert, tourism_registered, admin_notes, created_at::text
                    , cnp_encrypted
               FROM host_applications ${whereSql}
              ORDER BY created_at DESC LIMIT 100`,
            params,
        );
        rows = res.rows;
    } catch (e: any) {
        loadError = e?.message || "Eroare la încărcare";
    }

    return (
        <main className="mx-auto max-w-4xl px-4 py-8">
            <div className="mb-6">
                <Link href="/admin" className="text-sm text-black/50 hover:underline">← Admin</Link>
                <h1 className="mt-1 text-2xl font-black">Gazde Swypik Stays</h1>
                <p className="text-sm text-black/60">
                    Verifică dreptul de folosință, certificatul de clasificare și conformitatea fiscală
                    înainte de aprobare.
                </p>
            </div>

            <nav className="mb-5 flex flex-wrap gap-2">
                {TABS.map((t) => (
                    <Link
                        key={t}
                        href={`/admin/hosts?status=${t}`}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold ${status === t ? "bg-black text-white" : "bg-black/5 text-black/60"}`}
                    >
                        {t === "all" ? "Toate" : STATUS_LABELS[t]}
                    </Link>
                ))}
            </nav>

            {loadError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>
            )}

            {!loadError && rows.length === 0 && (
                <p className="rounded-xl bg-black/5 p-6 text-center text-sm text-black/50">
                    Nicio aplicație în această categorie.
                </p>
            )}

            <div className="space-y-4">
                {rows.map((r) => {
                    const needsCert = r.property_type === "pensiune" || r.property_type === "hotel";
                    return (
                        <article key={r.id} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="font-bold">{r.property_name}</h2>
                                    <p className="text-sm text-black/60">
                                        {r.property_type} · {r.city}, {r.county} · {r.rooms} camere · {r.max_guests} oaspeți
                                    </p>
                                    <p className="mt-0.5 text-xs text-black/50">{r.address}</p>
                                </div>
                                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLOR[r.status] ?? "bg-black/10"}`}>
                                    {STATUS_LABELS[r.status] ?? r.status}
                                </span>
                            </div>

                            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                <div><dt className="inline text-black/50">Gazdă: </dt><dd className="inline font-medium">{r.full_name}</dd></div>
                                <div><dt className="inline text-black/50">Formă: </dt><dd className="inline font-medium">{ENTITY_LABELS[r.entity_type] ?? r.entity_type}</dd></div>
                                <div><dt className="inline text-black/50">Telefon: </dt><dd className="inline font-medium">{r.phone}</dd></div>
                                <div><dt className="inline text-black/50">Email: </dt><dd className="inline font-medium">{r.email}</dd></div>
                                {r.company_name && <div><dt className="inline text-black/50">Firmă: </dt><dd className="inline font-medium">{r.company_name}</dd></div>}
                                {r.cui && <div><dt className="inline text-black/50">CUI: </dt><dd className="inline font-medium">{r.cui}</dd></div>}
                                {maskedCnpOf(r) && <div><dt className="inline text-black/50">CNP: </dt><dd className="inline font-mono font-medium" title="afișat mascat — integral doar la raportare fiscală">{maskedCnpOf(r)}</dd></div>}
                            </dl>

                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold ${r.tourism_registered ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                                    {r.tourism_registered ? <><Check size={12} /> Declară înregistrare ANAF</> : <><X size={12} /> Fără declarație ANAF</>}
                                </span>
                                {needsCert && (
                                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold ${r.classification_cert ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                                        {r.classification_cert ? <><Check size={12} /> Certificat: {r.classification_cert}</> : <><X size={12} /> Fără certificat de clasificare</>}
                                    </span>
                                )}
                                <span className="rounded-md bg-black/5 px-2 py-1 text-black/60">Trimisă: {fmtDate(r.created_at)}</span>
                            </div>

                            <div className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                                <strong>De verificat manual:</strong> extras CF sau contract de închiriere/comodat,
                                act de identitate al reprezentantului{needsCert ? ", valabilitatea certificatului de clasificare" : ""}.
                            </div>

                            {r.admin_notes && (
                                <p className="mt-2 rounded-lg bg-black/5 p-2 text-xs text-black/70">
                                    <strong>Notă:</strong> {r.admin_notes}
                                </p>
                            )}

                            {(r.status === "pending" || r.status === "needs_info") && <HostActions applicationId={r.id} />}
                        </article>
                    );
                })}
            </div>
        </main>
    );
}
