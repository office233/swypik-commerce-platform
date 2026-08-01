"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

export default function HostActions({ applicationId }: { applicationId: string }) {
    const t = useTranslations("adminHosts");
    const router = useRouter();
    const [note, setNote] = useState("");
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function run(action: "approve" | "reject" | "needs_info") {
        if (action !== "approve" && !note.trim()) {
            setError("Adaugă un motiv / ce documente lipsesc.");
            return;
        }
        const msg =
            action === "approve"
                ? "Aprobi gazda? Va putea publica proprietatea."
                : action === "reject"
                    ? "Respingi aplicația?"
                    : "Ceri documente suplimentare?";
        if (!confirm(msg)) return;
        setLoading(action);
        setError(null);
        try {
            const res = await fetch(`/api/admin/hosts/${applicationId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, note: note.trim() || undefined }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data?.error || `Eroare ${res.status}`);
                setLoading(null);
                return;
            }
            router.refresh();
        } catch (e: any) {
            setError(e?.message || "Eroare de rețea");
            setLoading(null);
        }
    }

    return (
        <div className="mt-3 border-t border-black/10 pt-3">
            <label className="mb-1 block text-xs font-bold uppercase text-black/60">
                Notă (obligatorie la respingere / cerere documente)
            </label>
            <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={1000}
                className="mb-2 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                placeholder={t("needsInfoPlaceholder")}
            />
            {error && (
                <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={loading !== null}
                    onClick={() => run("approve")}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                    {loading === "approve" ? "..." : "Aprobă"}
                </button>
                <button
                    type="button"
                    disabled={loading !== null}
                    onClick={() => run("needs_info")}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                    {loading === "needs_info" ? "..." : "Cere documente"}
                </button>
                <button
                    type="button"
                    disabled={loading !== null}
                    onClick={() => run("reject")}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                    {loading === "reject" ? "..." : "Respinge"}
                </button>
            </div>
        </div>
    );
}
