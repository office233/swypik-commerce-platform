"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Partner = { id: string; company_name: string };

const BTN = "rounded-lg px-3 py-1.5 text-[12px] font-bold disabled:opacity-50";

export default function FleetActions({
    courierId,
    status,
    active,
    partners,
}: {
    courierId: string;
    status: string;
    active?: boolean;
    partners: Partner[];
}) {
    const router = useRouter();
    const [loading, setLoading] = useState<string | null>(null);
    const [partnerId, setPartnerId] = useState("");

    async function run(action: "approve" | "reject" | "suspend" | "reactivate" | "delete") {
        const labels: Record<string, string> = {
            approve: "Aprobi această aplicație?",
            reject: "Respingi această aplicație?",
            suspend: "Suspenzi acest cont? Nu va mai primi curse.",
            reactivate: "Reactivezi acest cont?",
            delete: "ȘTERGI definitiv această înregistrare? Acțiunea nu poate fi anulată.",
        };
        if (!confirm(labels[action])) return;
        setLoading(action);
        try {
            const res = await fetch(`/api/admin/fleet/${courierId}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, fleet_partner_id: partnerId || undefined }),
            });
            if (res.ok) router.refresh();
            else alert("Eroare la salvare.");
        } finally {
            setLoading(null);
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            {status === "pending" && (
                <>
                    {partners.length > 0 && (
                        <select
                            value={partnerId}
                            onChange={(e) => setPartnerId(e.target.value)}
                            className="rounded-lg border border-black/10 px-2 py-1.5 text-[12px] font-semibold"
                        >
                            <option value="">Flota Swypik (direct)</option>
                            {partners.map((p) => (
                                <option key={p.id} value={p.id}>Franciza: {p.company_name}</option>
                            ))}
                        </select>
                    )}
                    <button type="button" disabled={loading !== null} onClick={() => run("approve")} className={`${BTN} bg-green-600 text-white`}>
                        {loading === "approve" ? "..." : "Aprobă"}
                    </button>
                    <button type="button" disabled={loading !== null} onClick={() => run("reject")} className={`${BTN} bg-red-500 text-white`}>
                        {loading === "reject" ? "..." : "Respinge"}
                    </button>
                </>
            )}

            {status === "approved" && active !== false && (
                <button type="button" disabled={loading !== null} onClick={() => run("suspend")} className={`${BTN} bg-gray-200 text-gray-700`}>
                    {loading === "suspend" ? "..." : "Suspendă"}
                </button>
            )}

            {status === "approved" && active === false && (
                <button type="button" disabled={loading !== null} onClick={() => run("reactivate")} className={`${BTN} bg-green-600 text-white`}>
                    {loading === "reactivate" ? "..." : "Reactivează"}
                </button>
            )}

            {status === "rejected" && (
                <button type="button" disabled={loading !== null} onClick={() => run("approve")} className={`${BTN} bg-green-600 text-white`}>
                    {loading === "approve" ? "..." : "Aprobă totuși"}
                </button>
            )}

            <button
                type="button"
                disabled={loading !== null}
                onClick={() => run("delete")}
                title="Șterge definitiv"
                className={`${BTN} bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50`}
            >
                {loading === "delete" ? "..." : "Șterge"}
            </button>
        </div>
    );
}

/** Acțiuni pe franciză: aprobă / respinge / suspendă / reactivează / șterge. */
export function PartnerActions({ partnerId, status }: { partnerId: string; status: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState<string | null>(null);

    async function run(action: "approve" | "reject" | "suspend" | "reactivate" | "delete") {
        const labels: Record<string, string> = {
            approve: "Aprobi această franciză?",
            reject: "Respingi această franciză?",
            suspend: "Suspenzi această franciză?",
            reactivate: "Reactivezi această franciză?",
            delete: "ȘTERGI definitiv această franciză?",
        };
        if (!confirm(labels[action])) return;
        setLoading(action);
        try {
            const res = await fetch(`/api/admin/fleet-partners/${partnerId}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            if (res.ok) router.refresh();
            else alert("Eroare la salvare.");
        } finally {
            setLoading(null);
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            {status === "pending" && (
                <>
                    <button type="button" disabled={loading !== null} onClick={() => run("approve")} className={`${BTN} bg-green-600 text-white`}>
                        {loading === "approve" ? "..." : "Aprobă"}
                    </button>
                    <button type="button" disabled={loading !== null} onClick={() => run("reject")} className={`${BTN} bg-red-500 text-white`}>
                        {loading === "reject" ? "..." : "Respinge"}
                    </button>
                </>
            )}
            {status === "active" && (
                <button type="button" disabled={loading !== null} onClick={() => run("suspend")} className={`${BTN} bg-gray-200 text-gray-700`}>
                    {loading === "suspend" ? "..." : "Suspendă"}
                </button>
            )}
            {(status === "suspended" || status === "rejected") && (
                <button type="button" disabled={loading !== null} onClick={() => run("reactivate")} className={`${BTN} bg-green-600 text-white`}>
                    {loading === "reactivate" ? "..." : "Activează"}
                </button>
            )}
            <button type="button" disabled={loading !== null} onClick={() => run("delete")} className={`${BTN} bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50`}>
                {loading === "delete" ? "..." : "Șterge"}
            </button>
        </div>
    );
}
