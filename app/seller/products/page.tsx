"use client";

import { useState, useEffect } from "react";

export default function SellerProductsPage() {
  const [isAdding, setIsAdding] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState("General");
  const [saving, setSaving] = useState(false);

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

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/seller/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, price, stock, category }),
      });
      const data = await res.json();
      if (data.success) {
        setIsAdding(false);
        setTitle("");
        setPrice("");
        setStock("");
        loadProducts();
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Eroare de rețea.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-[#0D0D0D]">Produsele mele</h1>
          <p className="text-sm text-[#6E6E80] mt-1">Gestionează catalogul tău de produse locale.</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="bg-[#0D0D0D] text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#0D0D0D]/80 transition active:scale-95"
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
                    <td className="px-6 py-4 font-bold text-[#0D0D0D]">{p.title}</td>
                    <td className="px-6 py-4 text-[#6E6E80]">{p.category || "General"}</td>
                    <td className="px-6 py-4">
                      <span className="inline-block px-2.5 py-1 bg-neutral-100 text-neutral-900 text-[10px] font-bold rounded-full uppercase tracking-wider">
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-[#0D0D0D]">{p.metadata?.available_stock || 0}</td>
                    <td className="px-6 py-4 text-right font-black text-[#0D0D0D]">{Number(p.price_cents / 100).toFixed(2)} lei</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0D0D0D]/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-[#E5E5E5] flex items-center justify-between">
              <h3 className="font-black text-[#0D0D0D] text-lg">Adaugă Produs Nou</h3>
              <button onClick={() => setIsAdding(false)} className="text-[#6E6E80] hover:text-[#0D0D0D] text-xl">✕</button>
            </div>
            <form onSubmit={handleAddProduct} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Titlu Produs</label>
                  <input required value={title} onChange={e => setTitle(e.target.value)} type="text" className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] focus:ring-1 focus:ring-[#0D0D0D] outline-none" placeholder="ex: Tricou Bumbac Organic" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Categorie</label>
                  <input required value={category} onChange={e => setCategory(e.target.value)} type="text" className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] focus:ring-1 focus:ring-[#0D0D0D] outline-none" placeholder="ex: Haine" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Preț (Lei)</label>
                    <input required min="1" step="0.01" value={price} onChange={e => setPrice(e.target.value)} type="number" className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] outline-none" placeholder="ex: 99.90" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#6E6E80] uppercase tracking-widest mb-1.5">Stoc Initial</label>
                    <input required min="1" value={stock} onChange={e => setStock(e.target.value)} type="number" className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm focus:border-[#0D0D0D] outline-none" placeholder="ex: 50" />
                  </div>
                </div>
              </div>
              <button disabled={saving} type="submit" className="w-full bg-[#0D0D0D] text-white font-bold py-3.5 rounded-xl mt-6 hover:bg-[#0E906F] transition active:scale-95 disabled:opacity-50">
                {saving ? "Se salvează..." : "Salvează Produsul"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
