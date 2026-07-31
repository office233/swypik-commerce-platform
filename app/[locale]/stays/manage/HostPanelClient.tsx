"use client";

/**
 * Panoul gazdei — creare/editare/publicare cazări.
 * Doar gazdele cu aplicație aprobată pot crea listinguri.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BedDouble, Plus, Loader2, Eye, EyeOff, Trash2, AlertTriangle, ImageIcon, CalendarDays } from "lucide-react";
import AvailabilityCalendar from "./AvailabilityCalendar";
import HostBookings from "./HostBookings";

type Listing = {
    id: string;
    title: string;
    description: string | null;
    image_url: string | null;
    price_cents: number | null;
    status: string;
    location_city: string | null;
    metadata: { max_guests?: number; property_type?: string } | null;
};

const lei = (c: number | null) =>
    c === null ? "—" : new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 0 }).format(c / 100);

export default function HostPanelClient() {
    const t = useTranslations("hostPanel");
    const [loading, setLoading] = useState(true);
    const [approved, setApproved] = useState(false);
    const [listings, setListings] = useState<Listing[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [calendarFor, setCalendarFor] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [form, setForm] = useState({ title: "", description: "", price: "", imageUrl: "", maxGuests: 2 });

    async function uploadPhoto(file: File) {
        setUploading(true);
        setError(null);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const r = await fetch("/api/host/upload", { method: "POST", credentials: "include", body: fd });
            const j = await r.json();
                if (!r.ok) { setError(j.error ?? t("uploadFailed")); return; }
            setForm((f) => ({ ...f, imageUrl: j.url }));
        } finally {
            setUploading(false);
        }
    }

    const load = useCallback(async () => {
        try {
            const r = await fetch("/api/host/listings", { credentials: "include" });
            if (r.status === 401) { setApproved(false); setListings([]); return; }
            const j = await r.json();
            setApproved(Boolean(j.approved));
            setListings(j.listings ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    async function create(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setBusy("create");
        try {
            const r = await fetch("/api/host/listings", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: form.title,
                    description: form.description || undefined,
                    pricePerNightCents: Math.round(Number(form.price) * 100),
                    imageUrl: form.imageUrl || undefined,
                    maxGuests: form.maxGuests,
                }),
            });
            const j = await r.json();
                if (!r.ok) { setError(j.error ?? t("createFailed")); return; }
            setForm({ title: "", description: "", price: "", imageUrl: "", maxGuests: 2 });
            setShowForm(false);
            await load();
        } finally {
            setBusy(null);
        }
    }

    async function act(id: string, body: any, label: string) {
        setError(null);
        setBusy(id + label);
        try {
            const r = await fetch(`/api/host/listings/${id}`, {
                method: body === null ? "DELETE" : "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: body === null ? undefined : JSON.stringify(body),
            });
            const j = await r.json().catch(() => ({}));
                if (!r.ok) { setError(j.error ?? t("actionFailed")); return; }
            await load();
        } finally {
            setBusy(null);
        }
    }

    const inp = "mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800";
    const lbl = "block text-xs font-medium text-neutral-500";

    if (loading) {
        return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="animate-spin text-neutral-400" /></div>;
    }

    return (
        <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
            <header className="mb-5 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600">
                    <BedDouble size={20} className="text-white" />
                </div>
                <div className="flex-1">
                        <h1 className="text-xl font-bold">{t("title")}</h1>
                        <p className="text-xs text-neutral-500">{t("subtitle")}</p>
                </div>
            </header>

            {!approved && (
                <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        <p className="font-semibold">{t("notApprovedTitle")}</p>
                        <p className="mt-1 text-xs">
                            {t("notApprovedBody")}{" "}
                            <Link href="/join/host" className="underline">{t("notApprovedLink")}</Link>.
                        </p>
                </div>
            )}

            {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
                </div>
            )}

            {approved && !showForm && (
                <button
                    onClick={() => setShowForm(true)}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 font-semibold text-white shadow"
                >
                        <Plus size={16} /> {t("addListing")}
                </button>
            )}

            {approved && showForm && (
                <form onSubmit={create} className="mt-4 space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                        <h2 className="text-sm font-bold">{t("newListing")}</h2>
                        <label className={lbl}>{t("fieldTitle")}
                            <input required minLength={5} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inp} placeholder={t("titlePlaceholder")} />
                        </label>
                        <label className={lbl}>{t("fieldDescription")}
                            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inp} placeholder={t("descPlaceholder")} />
                        </label>
                    <div className="grid grid-cols-2 gap-3">
                            <label className={lbl}>{t("pricePerNight")}
                            <input required type="number" min={20} step={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={inp} placeholder="250" />
                        </label>
                            <label className={lbl}>{t("maxGuests")}
                            <input required type="number" min={1} max={50} value={form.maxGuests} onChange={(e) => setForm({ ...form, maxGuests: Number(e.target.value) })} className={inp} />
                        </label>
                    </div>
                    <div>
                            <span className={lbl}>{t("photo")}</span>
                        {form.imageUrl ? (
                            <div className="mt-1 flex items-center gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={form.imageUrl} alt={t("preview")} className="h-16 w-24 rounded-lg object-cover" />
                                <button type="button" onClick={() => setForm({ ...form, imageUrl: "" })}
                                        className="text-xs font-semibold text-red-600">{t("change")}</button>
                            </div>
                        ) : (
                            <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 px-3 py-4 text-sm text-neutral-500 dark:border-neutral-700">
                                {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                                    {uploading ? t("uploading") : t("choosePhoto")}
                                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden"
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
                            </label>
                        )}
                            <span className="mt-1 block text-[11px] text-neutral-400">{t("photoRequired")}</span>
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" disabled={busy === "create"} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white disabled:opacity-40">
                                {busy === "create" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {t("save")}
                        </button>
                        <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold dark:border-neutral-700">
                                {t("cancel")}
                        </button>
                    </div>
                </form>
            )}

            <div className="mt-5 space-y-3">
                {listings.map((l) => (
                    <div key={l.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                        {l.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={l.image_url} alt={l.title} className="h-36 w-full object-cover" loading="lazy" />
                        ) : (
                            <div className="flex h-36 w-full items-center justify-center bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
                                <ImageIcon size={28} />
                            </div>
                        )}
                        <div className="p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h3 className="truncate font-bold">{l.title}</h3>
                                    <p className="text-xs text-neutral-500">
                                            {l.location_city ?? "—"} · {t("guests", { count: l.metadata?.max_guests ?? "?" })}
                                    </p>
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${l.status === "active" ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600"}`}>
                                        {l.status === "active" ? t("published") : t("draft")}
                                </span>
                            </div>
                            <p className="mt-1 text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                                    {lei(l.price_cents)}<span className="text-xs font-normal text-neutral-500"> {t("perNight")}</span>
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {l.status === "active" ? (
                                    <button onClick={() => act(l.id, { action: "unpublish" }, "u")} disabled={busy !== null}
                                        className="flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold dark:bg-neutral-800">
                                            <EyeOff size={14} /> {t("unpublish")}
                                    </button>
                                ) : (
                                    <button onClick={() => act(l.id, { action: "publish" }, "p")} disabled={busy !== null}
                                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
                                            <Eye size={14} /> {t("publish")}
                                    </button>
                                )}
                                    <button onClick={() => { if (confirm(t("deleteConfirm"))) act(l.id, null, "d"); }} disabled={busy !== null}
                                    className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                                        <Trash2 size={14} /> {t("delete")}
                                </button>
                                <button onClick={() => setCalendarFor(calendarFor === l.id ? null : l.id)}
                                    className="flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                                        <CalendarDays size={14} /> {t("calendar")}
                                </button>
                            </div>
                            {calendarFor === l.id && (
                                <AvailabilityCalendar listingId={l.id} onClose={() => setCalendarFor(null)} />
                            )}
                        </div>
                    </div>
                ))}
                {approved && listings.length === 0 && !showForm && (
                    <p className="rounded-xl bg-neutral-50 p-6 text-center text-sm text-neutral-500 dark:bg-neutral-900">
                            {t("empty")}
                    </p>
                )}
            </div>

            {approved && <HostBookings />}
        </div>
    );
}
