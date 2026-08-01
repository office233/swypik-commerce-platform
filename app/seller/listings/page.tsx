"use client";

/**
 * Universal Marketplace — Anunțuri (seller)
 * Publicare anunțuri (imobiliare / auto / servicii) + inbox lead-uri.
 */
import { useState, useEffect, useMemo } from "react";
import { Phone, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import {
    VERTICALS,
    verticalForSlug,
    type VerticalField,
} from "@/lib/verticals/registry";

const CATEGORY_OPTIONS: { slug: string; label: string }[] = [
    { slug: "real-estate/apartments-sale", label: "Apartamente de vânzare" },
    { slug: "real-estate/apartments-rent", label: "Apartamente de închiriat" },
    { slug: "real-estate/houses-sale", label: "Case de vânzare" },
    { slug: "real-estate/houses-rent", label: "Case de închiriat" },
    { slug: "real-estate/land", label: "Terenuri" },
    { slug: "real-estate/commercial", label: "Spații comerciale" },
    { slug: "vehicles/cars", label: "Autoturisme" },
    { slug: "vehicles/motorcycles", label: "Motociclete" },
    { slug: "vehicles/trucks", label: "Camioane și utilitare" },
    { slug: "services/home-repair", label: "Reparații și amenajări" },
    { slug: "services/beauty", label: "Frumusețe" },
    { slug: "services/education", label: "Educație și meditații" },
    { slug: "services/events", label: "Evenimente" },
    { slug: "services/transport", label: "Transport și mutări" },
];

const FIELD_LABELS: Record<string, string> = {
    surface: "Suprafață",
    rooms: "Camere",
    bathrooms: "Băi",
    floor: "Etaj",
    yearBuilt: "An construcție",
    condition: "Stare",
    energyClass: "Clasă energetică",
    furnished: "Mobilat",
    parking: "Parcare",
    make: "Marcă",
    model: "Model",
    year: "An fabricație",
    mileage: "Kilometraj",
    fuel: "Combustibil",
    transmission: "Cutie de viteze",
    engineCc: "Capacitate motor",
    powerKw: "Putere",
    serviceArea: "Zona de lucru",
    experienceYears: "Ani experiență",
    pricingModel: "Mod tarifare",
    availableRemote: "Disponibil remote",
    compatibleMakes: "Mărci compatibile",
};

const OPTION_LABELS: Record<string, string> = {
    new: "Nou", renovated: "Renovat", good: "Stare bună", needs_renovation: "Necesită renovare",
    used: "Second-hand", damaged: "Avariat", refurbished: "Recondiționat",
    petrol: "Benzină", diesel: "Diesel", hybrid: "Hibrid", electric: "Electric", lpg: "GPL",
    manual: "Manuală", automatic: "Automată",
    fixed: "Preț fix", hourly: "Pe oră", per_project: "Pe proiect", on_request: "La cerere",
    A: "A", B: "B", C: "C", D: "D", E: "E", F: "F", G: "G",
};

interface Listing {
    id: string;
    title: string;
    slug: string;
    price_cents: number | null;
    currency: string;
    taxonomy_node_slug: string;
    location_city: string | null;
    status: string;
    created_at: string;
}

interface Inquiry {
    id: string;
    product_title: string;
    name: string;
    email: string | null;
    phone: string | null;
    message: string;
    status: string;
    created_at: string;
}

export default function SellerListingsPage() {
    const t = useTranslations("sellerListings");
    const [tab, setTab] = useState<"listings" | "leads">("listings");
    const [isAdding, setIsAdding] = useState(false);
    const [listings, setListings] = useState<Listing[]>([]);
    const [inquiries, setInquiries] = useState<Inquiry[]>([]);
    const [loading, setLoading] = useState(true);

    // form state
    const [category, setCategory] = useState("");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState("");
    const [currency, setCurrency] = useState("EUR");
    const [city, setCity] = useState("");
    const [country, setCountry] = useState("RO");
    const [phone, setPhone] = useState("");
    const [attrs, setAttrs] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const vertical = useMemo(() => verticalForSlug(category), [category]);

    useEffect(() => {
        void load();
    }, []);

    async function load() {
        setLoading(true);
        try {
            const [lRes, iRes] = await Promise.all([
                fetch("/api/seller/products?listing_type=listing").then((r) => r.json()).catch(() => null),
                fetch("/api/inquiries").then((r) => r.json()).catch(() => null),
            ]);
            // fallback: /api/listings public cu filtrare client-side nu expune seller_id — folosim ce avem
            if (lRes?.success && Array.isArray(lRes.products)) {
                setListings(lRes.products.filter((p: { listing_type?: string }) => p.listing_type === "listing"));
            }
            if (iRes?.success) setInquiries(iRes.inquiries ?? []);
        } finally {
            setLoading(false);
        }
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setSubmitting(true);
        try {
            const body: Record<string, unknown> = {
                title,
                description: description || undefined,
                taxonomy_node_slug: category,
                currency,
                location_country: country || undefined,
                location_city: city || undefined,
                contact_phone: phone || undefined,
                vertical_attributes: attrs,
            };
            if (price) body.price = Number(price);
            const res = await fetch("/api/listings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || "Eroare la publicare.");
                return;
            }
            setIsAdding(false);
            setTitle(""); setDescription(""); setPrice(""); setCity(""); setPhone(""); setAttrs({});
            void load();
        } finally {
            setSubmitting(false);
        }
    }

    function renderField(f: VerticalField) {
        const label = FIELD_LABELS[f.labelKey] ?? f.labelKey;
        const val = attrs[f.key] ?? "";
        const set = (v: string) => setAttrs((a) => ({ ...a, [f.key]: v }));
        const base =
            "w-full border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-violet-500 focus:outline-none";
        if (f.type === "select") {
            return (
                <div key={f.key}>
                    <label className="block text-xs font-bold text-[#6E6E80] mb-1">
                        {label}{f.required ? " *" : ""}
                    </label>
                    <select className={base} value={val} onChange={(e) => set(e.target.value)} required={f.required}>
                        <option value="">—</option>
                        {f.options?.map((o) => (
                            <option key={o} value={o}>{OPTION_LABELS[o] ?? o}</option>
                        ))}
                    </select>
                </div>
            );
        }
        if (f.type === "boolean") {
            return (
                <label key={f.key} className="flex items-center gap-2 text-sm font-medium pt-6">
                    <input
                        type="checkbox"
                        checked={val === "true"}
                        onChange={(e) => set(e.target.checked ? "true" : "false")}
                        className="w-4 h-4 accent-violet-600"
                    />
                    {label}
                </label>
            );
        }
        return (
            <div key={f.key}>
                <label className="block text-xs font-bold text-[#6E6E80] mb-1">
                    {label}{f.unit ? ` (${f.unit})` : ""}{f.required ? " *" : ""}
                </label>
                <input
                    className={base}
                    type={f.type === "number" || f.type === "year" ? "number" : "text"}
                    value={val}
                    min={f.min}
                    max={f.max}
                    required={f.required}
                    onChange={(e) => set(e.target.value)}
                />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 md:px-6 pb-[max(24px,env(safe-area-inset-bottom))]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-2xl font-black text-[#0D0D0D]">{t("title")}</h1>
                    <p className="text-sm text-[#6E6E80] mt-1">
                        Imobiliare, auto și servicii — anunțuri cu formular de contact, fără coș.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsAdding(true)}
                    className="inline-flex items-center justify-center bg-[#0D0D0D] text-white px-5 py-2.5 min-h-[44px] rounded-xl font-bold text-sm hover:bg-[#0D0D0D]/80 transition active:scale-95"
                >
                    + Publică anunț
                </button>
            </div>

            <div className="flex gap-2 mb-4">
                <button
                    type="button"
                    onClick={() => setTab("listings")}
                    className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === "listings" ? "bg-[#0D0D0D] text-white" : "bg-[#F7F7F8] text-[#6E6E80]"}`}
                >
                    Anunțuri
                </button>
                <button
                    type="button"
                    onClick={() => setTab("leads")}
                    className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === "leads" ? "bg-[#0D0D0D] text-white" : "bg-[#F7F7F8] text-[#6E6E80]"}`}
                >
                    Lead-uri {inquiries.filter((i) => i.status === "new").length > 0 && (
                        <span className="ml-1 bg-violet-600 text-white rounded-full px-2 py-0.5 text-[10px]">
                            {inquiries.filter((i) => i.status === "new").length}
                        </span>
                    )}
                </button>
            </div>

            {isAdding && (
                <form onSubmit={submit} className="bg-white rounded-2xl border border-[#E5E5E5] shadow-sm p-6 mb-6 space-y-4">
                    <h2 className="font-black text-lg">{t("newListing")}</h2>
                    {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

                    <div>
                        <label className="block text-xs font-bold text-[#6E6E80] mb-1">Categorie *</label>
                        <select
                            className="w-full border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm"
                            value={category}
                            onChange={(e) => { setCategory(e.target.value); setAttrs({}); }}
                            required
                        >
                            <option value="">Alege categoria…</option>
                            {CATEGORY_OPTIONS.map((c) => (
                                <option key={c.slug} value={c.slug}>{c.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-[#6E6E80] mb-1">Titlu *</label>
                        <input
                            className="w-full border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm"
                            value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={200}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-[#6E6E80] mb-1">Descriere</label>
                        <textarea
                            className="w-full border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm min-h-[100px]"
                            value={description} onChange={(e) => setDescription(e.target.value)} maxLength={10000}
                        />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-[#6E6E80] mb-1">
                                Preț{vertical?.priceOptional ? " (opțional)" : " *"}
                            </label>
                            <input
                                className="w-full border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm"
                                type="number" min={0} step="0.01" value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                required={!vertical?.priceOptional}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[#6E6E80] mb-1">{t("currency")}</label>
                            <select
                                className="w-full border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm"
                                value={currency} onChange={(e) => setCurrency(e.target.value)}
                            >
                                <option value="EUR">EUR</option>
                                <option value="RON">RON</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[#6E6E80] mb-1">{t("country")}</label>
                            <input
                                className="w-full border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm"
                                value={country} onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                                placeholder="RO" maxLength={2}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[#6E6E80] mb-1">{t("city")}</label>
                            <input
                                className="w-full border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm"
                                value={city} onChange={(e) => setCity(e.target.value)}
                            />
                        </div>
                    </div>

                    {vertical && vertical.fields.length > 0 && (
                        <div>
                            <h3 className="text-sm font-black mb-2 mt-2">Detalii specifice</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {vertical.fields.map(renderField)}
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-[#6E6E80] mb-1">{t("contactPhone")}</label>
                        <input
                            className="w-full md:w-1/2 border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm"
                            value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32}
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="submit" disabled={submitting}
                            className="bg-violet-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-violet-700 disabled:opacity-50"
                        >
                            {submitting ? "Se publică…" : "Publică anunțul"}
                        </button>
                        <button
                            type="button" onClick={() => setIsAdding(false)}
                            className="bg-[#F7F7F8] text-[#0D0D0D] px-6 py-2.5 rounded-xl font-bold text-sm"
                        >
                            Anulează
                        </button>
                    </div>
                </form>
            )}

            {tab === "listings" ? (
                <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-sm overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[#F7F7F8] border-b border-[#E5E5E5]">
                            <tr>
                                <th className="px-6 py-4 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px]">{t("thListing")}</th>
                                <th className="px-6 py-4 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px]">Categorie</th>
                                <th className="px-6 py-4 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px]">{t("thLocation")}</th>
                                <th className="px-6 py-4 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px] text-right">{t("thPrice")}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E5E5]">
                            {loading ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-[#6E6E80]">{t("loading")}</td></tr>
                            ) : listings.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-[#6E6E80]">{t("empty")}</td></tr>
                            ) : (
                                listings.map((l) => (
                                    <tr key={l.id}>
                                        <td className="px-6 py-4 font-medium">{l.title}</td>
                                        <td className="px-6 py-4 text-[#6E6E80]">{l.taxonomy_node_slug}</td>
                                        <td className="px-6 py-4 text-[#6E6E80]">{l.location_city ?? "—"}</td>
                                        <td className="px-6 py-4 text-right font-bold">
                                            {l.price_cents != null ? `${(l.price_cents / 100).toLocaleString()} ${l.currency}` : "La cerere"}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="space-y-3">
                    {inquiries.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-[#E5E5E5] p-8 text-center text-[#6E6E80]">
                            Niciun lead încă. Când cineva completează formularul de contact pe un anunț, apare aici.
                        </div>
                    ) : (
                        inquiries.map((i) => (
                            <div key={i.id} className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-bold text-sm">{i.name}
                                            {i.status === "new" && <span className="ml-2 bg-violet-100 text-violet-700 text-[10px] font-black px-2 py-0.5 rounded-full">NOU</span>}
                                        </p>
                                        <p className="text-xs text-[#6E6E80] mt-0.5">pentru: {i.product_title}</p>
                                    </div>
                                    <span className="text-xs text-[#6E6E80]">{new Date(i.created_at).toLocaleDateString()}</span>
                                </div>
                                <p className="text-sm mt-3">{i.message}</p>
                                <div className="flex gap-4 mt-3 text-sm font-medium text-violet-700">
                                    {i.phone && <a href={`tel:${i.phone}`} className="inline-flex items-center gap-1.5"><Phone size={14} /> {i.phone}</a>}
                                    {i.email && <a href={`mailto:${i.email}`} className="inline-flex items-center gap-1.5"><Mail size={14} /> {i.email}</a>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
