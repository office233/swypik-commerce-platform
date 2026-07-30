"use client";

/**
 * Înrolare flotă — șoferi Swypik Go (kind=driver) și curieri Food (kind=courier).
 * POST /api/couriers (public, rate-limited); dacă userul e logat, aplicația
 * se leagă automat de cont (user_id) și apare în „Modurile mele".
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bike, Car, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

const VEHICLES: { value: string; labelKey: string }[] = [
    { value: "bike", labelKey: "vBike" },
    { value: "scooter", labelKey: "vScooter" },
    { value: "motorcycle", labelKey: "vMoto" },
    { value: "car", labelKey: "vCar" },
    { value: "van", labelKey: "vVan" },
];

export default function FleetApplyClient() {
    const t = useTranslations("join");
    const router = useRouter();
    const params = useSearchParams();
    const kind = params.get("kind") === "driver" ? "driver" : "courier";
    const isGo = kind === "driver";

    const [form, setForm] = useState({
        full_name: "",
        phone: "",
        email: "",
        city: "",
        vehicle_type: isGo ? "car" : "bike",
        vehicle_plate: "",
    });
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetch("/api/couriers", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    kind,
                    full_name: form.full_name,
                    phone: form.phone,
                    email: form.email || undefined,
                    city: form.city,
                    vehicle_type: form.vehicle_type,
                    vehicle_plate: form.vehicle_plate || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                setError(typeof data.error === "string" ? data.error : t("errGeneric"));
                return;
            }
            setDone(true);
        } catch {
            setError(t("errGeneric"));
        } finally {
            setLoading(false);
        }
    }

    if (done) {
        return (
            <main className="grid min-h-screen place-items-center bg-[#FAFAFB] px-4">
                <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
                    <CheckCircle2 size={48} className="mx-auto text-green-500" />
                    <h1 className="mt-4 text-xl font-black text-[#0D0D0D]">{t("doneTitle")}</h1>
                    <p className="mt-2 text-[14px] text-[#6E6E80]">{isGo ? t("doneGo") : t("doneFood")}</p>
                    <button
                        type="button"
                        onClick={() => router.push(isGo ? "/courier" : "/courier")}
                        className="mt-6 w-full rounded-2xl bg-[#0D0D0D] py-3 text-[14px] font-extrabold text-white"
                    >
                        {t("openPanel")}
                    </button>
                    <Link href="/" className="mt-3 block text-[13px] font-bold text-violet-600 hover:underline">
                        {t("backHome")}
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#FAFAFB] px-4 py-8">
            <div className="mx-auto max-w-md">
                <Link href="/join" className="text-[13px] font-bold text-[#6E6E80] hover:text-[#0D0D0D]">← {t("back")}</Link>
                <div className="mt-4 flex items-center gap-3">
                    <span
                        className="flex h-12 w-12 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: isGo ? "#F59E0B1A" : "#2DBE601A" }}
                    >
                        {isGo ? <Car size={24} className="text-amber-500" /> : <Bike size={24} className="text-green-600" />}
                    </span>
                    <div>
                        <h1 className="text-xl font-black text-[#0D0D0D]">{isGo ? t("goFormTitle") : t("foodFormTitle")}</h1>
                        <p className="text-[13px] text-[#6E6E80]">{isGo ? t("goFormSub") : t("foodFormSub")}</p>
                    </div>
                </div>

                <form onSubmit={submit} className="mt-6 space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                    {error && (
                        <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] font-bold text-red-600">{error}</p>
                    )}
                    <Field label={t("fullName")}>
                        <input required minLength={3} value={form.full_name} onChange={set("full_name")} className={inputCls} autoComplete="name" />
                    </Field>
                    <Field label={t("phone")}>
                        <input required type="tel" minLength={5} value={form.phone} onChange={set("phone")} className={inputCls} autoComplete="tel" />
                    </Field>
                    <Field label={`${t("email")} (${t("optional")})`}>
                        <input type="email" value={form.email} onChange={set("email")} className={inputCls} autoComplete="email" />
                    </Field>
                    <Field label={t("city")}>
                        <input required minLength={2} value={form.city} onChange={set("city")} className={inputCls} autoComplete="address-level2" />
                    </Field>
                    <Field label={t("vehicle")}>
                        <select value={form.vehicle_type} onChange={set("vehicle_type")} className={inputCls}>
                            {(isGo ? VEHICLES.filter((v) => ["car", "van"].includes(v.value)) : VEHICLES).map((v) => (
                                <option key={v.value} value={v.value}>{t(v.labelKey)}</option>
                            ))}
                        </select>
                    </Field>
                    {["car", "van", "motorcycle"].includes(form.vehicle_type) && (
                        <Field label={t("plate")}>
                            <input value={form.vehicle_plate} onChange={set("vehicle_plate")} className={inputCls} placeholder="B 123 ABC" />
                        </Field>
                    )}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-2xl bg-[#0D0D0D] py-3.5 text-[15px] font-extrabold text-white transition active:scale-[0.98] disabled:opacity-60"
                    >
                        {loading ? <Loader2 size={18} className="mx-auto animate-spin" /> : t("apply")}
                    </button>
                    <p className="text-center text-[11px] text-[#A1A1AA]">{t("applyNote")}</p>
                </form>
            </div>
        </main>
    );
}

const inputCls =
    "w-full rounded-xl border border-black/10 px-3 py-2.5 text-[14px] font-semibold text-[#0D0D0D] outline-none transition focus:border-violet-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-[#A1A1AA]">{label}</span>
            {children}
        </label>
    );
}
