"use client";

import { useState, useRef } from "react";

type Suggestion = { slug: string; confidence: number; label: string };
type Variant = { sku: string; title: string; price: string; stock: string; color: string; size: string };
type UploadedImage = { url: string; key: string };

const COURIERS = [
  { value: "dpd", label: "DPD" },
  { value: "fan_courier", label: "FAN Courier" },
  { value: "sameday", label: "Sameday" },
  { value: "cargus", label: "Cargus" },
  { value: "posta_romana", label: "Poșta Română" },
  { value: "gls", label: "GLS" },
  { value: "other", label: "Alt curier" },
];

const STEPS = ["Detalii", "Imagini", "Preț & Stoc", "Livrare"] as const;

export default function AddProductWizard({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: details
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [sku, setSku] = useState("");
  const [classifying, setClassifying] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [taxonomySlug, setTaxonomySlug] = useState<string>("");
  const [categoryText, setCategoryText] = useState("");

  // Step 2: images
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3: pricing
  const [price, setPrice] = useState("");
  const [compareAt, setCompareAt] = useState("");
  const [supplierCost, setSupplierCost] = useState("");
  const [currency, setCurrency] = useState<"RON" | "EUR" | "USD">("RON");
  const [stock, setStock] = useState("");
  const [variantsEnabled, setVariantsEnabled] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);

  // Step 4: shipping
  const [shippingCost, setShippingCost] = useState("");
  const [shippingDaysMin, setShippingDaysMin] = useState("");
  const [shippingDaysMax, setShippingDaysMax] = useState("");
  const [courier, setCourier] = useState<string>("dpd");

  async function classifyNow() {
    if (title.trim().length < 3) {
      setError("Introdu un titlu (min 3 caractere) înainte de detectare.");
      return;
    }
    setError(null);
    setClassifying(true);
    try {
      const res = await fetch("/api/seller/products/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: description || undefined }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Eroare clasificare");
      const list: Suggestion[] = data.suggestions || [];
      setSuggestions(list);
      if (list[0]) {
        setTaxonomySlug(list[0].slug);
        setCategoryText(list[0].label);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setClassifying(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const remaining = 8 - images.length;
    const toUpload = Array.from(files).slice(0, remaining);
    setUploadingCount((c) => c + toUpload.length);
    for (const f of toUpload) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("filename", f.name);
        const res = await fetch("/api/seller/products/upload-image", { method: "POST", body: fd });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Upload eșuat");
        setImages((arr) => [...arr, { url: data.url, key: data.key }]);
      } catch (e: any) {
        setError(`${f.name}: ${e.message}`);
      } finally {
        setUploadingCount((c) => c - 1);
      }
    }
  }

  function removeImage(idx: number) {
    setImages((arr) => arr.filter((_, i) => i !== idx));
  }

  function addVariantRow() {
    setVariants((arr) => [...arr, { sku: "", title: "", price: "", stock: "", color: "", size: "" }]);
  }
  function updateVariant(idx: number, patch: Partial<Variant>) {
    setVariants((arr) => arr.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  }
  function removeVariant(idx: number) {
    setVariants((arr) => arr.filter((_, i) => i !== idx));
  }

  function canGoNext(): boolean {
    if (step === 0) return title.trim().length >= 3;
    if (step === 1) return true; // imagini opționale
    if (step === 2) return Number(price) > 0 && Number(stock) >= 0;
    return true;
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim() || undefined,
        brand: brand.trim() || undefined,
        sku: sku.trim() || undefined,
        price: Number(price),
        compare_at_price: compareAt ? Number(compareAt) : undefined,
        supplier_cost: supplierCost ? Number(supplierCost) : undefined,
        currency,
        stock: Number(stock),
        category: categoryText || undefined,
        taxonomy_node_slug: taxonomySlug || undefined,
        image_urls: images.map((i) => i.url),
        shipping_cost: shippingCost ? Number(shippingCost) : undefined,
        shipping_days_min: shippingDaysMin ? Number(shippingDaysMin) : undefined,
        shipping_days_max: shippingDaysMax ? Number(shippingDaysMax) : undefined,
        courier: courier || undefined,
      };
      if (variantsEnabled && variants.length > 0) {
        payload.variants = variants
          .filter((v) => v.sku || v.title || v.price || v.stock || v.color || v.size)
          .map((v) => ({
            sku: v.sku || undefined,
            title: v.title || [v.color, v.size].filter(Boolean).join(" / ") || undefined,
            attributes: {
              ...(v.color ? { color: v.color } : {}),
              ...(v.size ? { size: v.size } : {}),
            },
            price_cents: v.price ? Math.round(Number(v.price) * 100) : undefined,
            inventory_quantity: v.stock ? Number(v.stock) : undefined,
          }));
      }
      const res = await fetch("/api/seller/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Eroare la salvare");
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="add-product-title" className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#0D0D0D]/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-[#E5E5E5] flex items-center justify-between">
          <div>
            <h3 id="add-product-title" className="font-black text-[#0D0D0D] text-lg">Adaugă Produs Nou</h3>
            <p className="text-xs text-[#6E6E80] mt-0.5">Pasul {step + 1} din {STEPS.length}: {STEPS[step]}</p>
          </div>
          <button type="button" aria-label="Închide" onClick={onClose} className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-[#6E6E80] hover:text-[#0D0D0D] hover:bg-[#F7F7F8] text-xl focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none">✕</button>
        </div>

        <div className="px-6 pt-3">
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-[#0D0D0D]" : "bg-[#E5E5E5]"}`} aria-hidden="true" />
            ))}
          </div>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          {error && (
            <div role="alert" className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
              {error}
            </div>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Titlu Produs *</label>
                <input required value={title} onChange={(e) => setTitle(e.target.value)} type="text" className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] focus:ring-1 focus:ring-[#0D0D0D] outline-none" placeholder="ex: Tricou Bumbac Organic Bărbătesc Negru M" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Descriere</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] focus:ring-1 focus:ring-[#0D0D0D] outline-none resize-y" placeholder="Detalii despre material, dimensiuni, instrucțiuni de îngrijire..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Marcă</label>
                  <input value={brand} onChange={(e) => setBrand(e.target.value)} type="text" className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] outline-none" placeholder="ex: Nike" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">SKU / Cod produs</label>
                  <input value={sku} onChange={(e) => setSku(e.target.value)} type="text" className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] outline-none" placeholder="ex: TRC-BLK-M-001" />
                </div>
              </div>

              <div className="border border-[#E5E5E5] rounded-xl p-4 bg-[#F7F7F8]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-bold text-sm text-[#0D0D0D]">Categorie</p>
                    <p className="text-xs text-[#6E6E80] mt-0.5">Detectează automat sau alege manual.</p>
                  </div>
                  <button type="button" onClick={classifyNow} disabled={classifying || title.trim().length < 3} className="px-4 py-2 min-h-[40px] bg-[#0D0D0D] text-white text-xs font-bold rounded-lg hover:bg-[#0D0D0D]/80 disabled:opacity-40 transition focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none">
                    {classifying ? "Se detectează..." : "✨ Detectează"}
                  </button>
                </div>
                {suggestions.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {suggestions.map((s) => (
                      <button key={s.slug} type="button" onClick={() => { setTaxonomySlug(s.slug); setCategoryText(s.label); }} className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition ${taxonomySlug === s.slug ? "bg-[#0D0D0D] text-white border-[#0D0D0D]" : "bg-white border-[#E5E5E5] hover:border-[#0D0D0D]"}`}>
                        <span className="font-bold">{s.label}</span>
                        <span className="ml-2 opacity-70">{Math.round(s.confidence * 100)}%</span>
                      </button>
                    ))}
                  </div>
                )}
                <input value={categoryText} onChange={(e) => { setCategoryText(e.target.value); setTaxonomySlug(""); }} type="text" className="w-full border border-[#E5E5E5] rounded-lg px-3 py-2 text-xs focus:border-[#0D0D0D] outline-none bg-white" placeholder="sau introdu manual ex: Fashion > Men > Tricouri" />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-[#6E6E80]">Adaugă până la 8 imagini. Prima imagine va fi cea principală. Format: JPG, PNG, WebP (max 5MB).</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {images.map((img, idx) => (
                  <div key={img.key} className="relative aspect-square rounded-xl overflow-hidden border border-[#E5E5E5] group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={`Imagine ${idx + 1}`} className="w-full h-full object-cover" />
                    {idx === 0 && <span className="absolute top-1 left-1 px-2 py-0.5 bg-[#0D0D0D] text-white text-[10px] font-bold rounded-full">PRINCIPAL</span>}
                    <button type="button" onClick={() => removeImage(idx)} aria-label="Șterge imaginea" className="absolute top-1 right-1 w-7 h-7 bg-white/90 hover:bg-white rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition">✕</button>
                  </div>
                ))}
                {images.length < 8 && (
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-[#E5E5E5] hover:border-[#0D0D0D] flex flex-col items-center justify-center text-[#6E6E80] hover:text-[#0D0D0D] transition focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none">
                    <span className="text-2xl mb-1">{uploadingCount > 0 ? "⏳" : "📷"}</span>
                    <span className="text-xs font-bold">{uploadingCount > 0 ? `Se urcă ${uploadingCount}...` : "Adaugă"}</span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                multiple
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
                className="hidden"
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Preț Vânzare *</label>
                  <input required min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} type="number" className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] outline-none" placeholder="99.90" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Monedă</label>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value as any)} className="w-full border border-[#E5E5E5] rounded-xl px-3 py-3 text-sm focus:border-[#0D0D0D] outline-none bg-white">
                    <option value="RON">RON</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Preț Comparativ <span className="text-[#6E6E80] normal-case font-normal">(opțional)</span></label>
                  <input min="0" step="0.01" value={compareAt} onChange={(e) => setCompareAt(e.target.value)} type="number" className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] outline-none" placeholder="149.90" />
                  <p className="text-[10px] text-[#6E6E80] mt-1">Arătat ca tăiat — sugerează reducere.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Cost Furnizor <span className="text-[#6E6E80] normal-case font-normal">(opțional)</span></label>
                  <input min="0" step="0.01" value={supplierCost} onChange={(e) => setSupplierCost(e.target.value)} type="number" className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] outline-none" placeholder="40.00" />
                  <p className="text-[10px] text-[#6E6E80] mt-1">Doar pentru calcul margine, ascuns clienților.</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Stoc *</label>
                <input required min="0" value={stock} onChange={(e) => setStock(e.target.value)} type="number" className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] outline-none" placeholder="50" />
              </div>

              <div className="border-t border-[#E5E5E5] pt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={variantsEnabled} onChange={(e) => setVariantsEnabled(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm font-bold text-[#0D0D0D]">Acest produs are variante (mărime / culoare)</span>
                </label>
                {variantsEnabled && (
                  <div className="mt-3 space-y-2">
                    {variants.map((v, idx) => (
                      <div key={idx} className="border border-[#E5E5E5] rounded-lg p-3 grid grid-cols-12 gap-2 items-start">
                        <input value={v.color} onChange={(e) => updateVariant(idx, { color: e.target.value })} placeholder="Culoare" className="col-span-3 border border-[#E5E5E5] rounded-md px-2 py-1.5 text-xs focus:border-[#0D0D0D] outline-none" />
                        <input value={v.size} onChange={(e) => updateVariant(idx, { size: e.target.value })} placeholder="Mărime" className="col-span-2 border border-[#E5E5E5] rounded-md px-2 py-1.5 text-xs focus:border-[#0D0D0D] outline-none" />
                        <input value={v.sku} onChange={(e) => updateVariant(idx, { sku: e.target.value })} placeholder="SKU" className="col-span-3 border border-[#E5E5E5] rounded-md px-2 py-1.5 text-xs focus:border-[#0D0D0D] outline-none" />
                        <input value={v.price} onChange={(e) => updateVariant(idx, { price: e.target.value })} placeholder="Preț" type="number" min="0" step="0.01" className="col-span-2 border border-[#E5E5E5] rounded-md px-2 py-1.5 text-xs focus:border-[#0D0D0D] outline-none" />
                        <input value={v.stock} onChange={(e) => updateVariant(idx, { stock: e.target.value })} placeholder="Stoc" type="number" min="0" className="col-span-1 border border-[#E5E5E5] rounded-md px-2 py-1.5 text-xs focus:border-[#0D0D0D] outline-none" />
                        <button type="button" onClick={() => removeVariant(idx)} aria-label="Șterge variantă" className="col-span-1 h-8 text-[#6E6E80] hover:text-red-600 text-sm">✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={addVariantRow} className="w-full py-2 text-xs font-bold text-[#0D0D0D] border border-dashed border-[#E5E5E5] hover:border-[#0D0D0D] rounded-lg transition">+ Adaugă variantă</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Cost Livrare ({currency})</label>
                <input min="0" step="0.01" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} type="number" className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] outline-none" placeholder="ex: 19.90 (0 = livrare gratuită)" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Zile livrare (min)</label>
                  <input min="0" value={shippingDaysMin} onChange={(e) => setShippingDaysMin(e.target.value)} type="number" className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] outline-none" placeholder="ex: 2" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Zile livrare (max)</label>
                  <input min="0" value={shippingDaysMax} onChange={(e) => setShippingDaysMax(e.target.value)} type="number" className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] outline-none" placeholder="ex: 5" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Curier preferat</label>
                <select value={courier} onChange={(e) => setCourier(e.target.value)} className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] outline-none bg-white">
                  {COURIERS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="bg-[#F7F7F8] rounded-xl p-4 text-xs text-[#6E6E80]">
                <p className="font-bold text-[#0D0D0D] mb-1">📦 Recapitulare</p>
                <p>{title || "(titlu lipsă)"} · {price ? `${price} ${currency}` : "preț lipsă"} · stoc {stock || 0}</p>
                <p className="mt-1">Categorie: {categoryText || "(nedetectată)"}</p>
                <p>Imagini: {images.length} · Variante: {variantsEnabled ? variants.length : 0}</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#E5E5E5] flex items-center justify-between gap-3">
          <button type="button" onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))} className="px-5 py-2.5 min-h-[44px] text-sm font-bold text-[#6E6E80] hover:text-[#0D0D0D] transition focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none rounded-lg">
            {step === 0 ? "Anulează" : "← Înapoi"}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canGoNext()} className="px-6 py-2.5 min-h-[44px] bg-[#0D0D0D] text-white text-sm font-bold rounded-xl hover:bg-[#0D0D0D]/80 disabled:opacity-40 transition focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none">
              Continuă →
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={saving || !price || !stock} className="px-6 py-2.5 min-h-[44px] bg-[#0E906F] text-white text-sm font-bold rounded-xl hover:bg-[#0E906F]/80 disabled:opacity-40 transition focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none">
              {saving ? "Se salvează..." : "✓ Publică Produsul"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
