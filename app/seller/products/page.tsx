"use client";

import { useState, useEffect } from "react";
import AddProductWizard from "./AddProductWizard";

export default function SellerProductsPage() {
  const [isAdding, setIsAdding] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    setLoading(true);
    try {
      const res = await fetch("/api/seller/products");
      const data = await res.json();
      if (data.success) {
        setProducts(data.products);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-[#0D0D0D]">Produsele mele</h1>
          <p className="text-sm text-[#6E6E80] mt-1">Gestionează catalogul tău de produse locale.</p>
        </div>
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          aria-label="Adaugă produs nou"
          className="inline-flex items-center justify-center bg-[#0D0D0D] text-white px-5 py-2.5 min-h-[44px] rounded-xl font-bold text-sm hover:bg-[#0D0D0D]/80 transition active:scale-95 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          + Adaugă Produs
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F7F7F8] border-b border-[#E5E5E5]">
              <tr>
                <th className="px-6 py-4 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px]">Produs</th>
                <th className="px-6 py-4 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px]">Categorie</th>
                <th className="px-6 py-4 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px]">Status</th>
                <th className="px-6 py-4 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px]">Stoc</th>
                <th className="px-6 py-4 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px] text-right">Preț</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E5]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#6E6E80]">Se încarcă...</td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <p className="text-3xl mb-3">🏷️</p>
                    <p className="font-bold text-[#0D0D0D]">Niciun produs adăugat.</p>
                    <p className="text-sm text-[#6E6E80] mt-1">Începe să vinzi adăugând primul tău produs.</p>
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F7F7F8] transition">
                    <td className="px-6 py-4 font-bold text-[#0D0D0D]">
                      <div className="flex items-center gap-3">
                        {p.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-[#E5E5E5]" />
                        )}
                        <span className="line-clamp-2">{p.title}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[#6E6E80]">{p.category || "General"}</td>
                    <td className="px-6 py-4">
                      <span className="inline-block px-2.5 py-1 bg-neutral-100 text-neutral-900 text-[10px] font-bold rounded-full uppercase tracking-wider">
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-[#0D0D0D]">{p.metadata?.available_stock ?? 0}</td>
                    <td className="px-6 py-4 text-right font-black text-[#0D0D0D]">{Number(p.price_cents / 100).toFixed(2)} {p.currency || "lei"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAdding && (
        <AddProductWizard
          onClose={() => setIsAdding(false)}
          onSaved={() => { setIsAdding(false); loadProducts(); }}
        />
      )}
    </div>
  );
}
