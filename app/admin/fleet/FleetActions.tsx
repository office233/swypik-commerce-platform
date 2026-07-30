"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Partner = { id: string; company_name: string };

export default function FleetActions({
    courierId,
    status,
    partners,
}: {
    courierId: string;
    status: string;
    partners: Partner[];
}) {
    const router = useRouter();
    const [loading, setLoading] = useState<string | null>(null);
    const [partnerId, setPartnerId] = useState("");

    async function run(action: "approve" | "reject" | "suspend") {
        const labels = { approve: "Aprobi această aplicație?", reject: "Respingi această aplicație?", suspend: "Suspenzi acest cont?" };
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

    if (status === "pending") {
        return (
            <div className="flex flex-wrap items-center gap-2">
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
                <button
                    type="button"
                    disabled={loading !== null}
                    onClick={() => run("approve")}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                >
                    {loading === "approve" ? "..." : "Aprobă"}
                </button>
                <button
                    type="button"
                    disabled={loading !== null}
                    onClick={() => run("reject")}
                    className="rounded-lg bg-red-500 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                >
                    {loading === "reject" ? "..." : "Respinge"}
                </button>
            </div>
        );
    }

    if (status === "approved") {
        return (
            <button
                type="button"
                disabled={loading !== null}
                onClick={() => run("suspend")}
                className="rounded-lg bg-gray-200 px-3 py-1.5 text-[12px] font-bold text-gray-700 disabled:opacity-50"
            >
                {loading === "suspend" ? "..." : "Suspendă"}
            </button>
        );
    }

    return <span className="text-[12px] text-[#A1A1AA]">—</span>;
}
