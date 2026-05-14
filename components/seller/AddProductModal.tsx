"use client";

import { X } from "lucide-react";
import { useState } from "react";

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddProductModal({ isOpen, onClose }: AddProductModalProps) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const price = parseFloat(formData.get("price") as string) || 0;
    
    try {
      const res = await fetch("/api/seller/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.get("title"),
          price_cents: Math.round(price * 100),
          description: formData.get("description"),
          status: "active",
        }),
      });
      
      if (res.ok) {
        onClose();
        window.location.reload(); // Quick refresh for MVP
      } else {
        console.error("Failed to add product");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg overflow-hidden border border-[#E5E5E5]">
        <div className="flex items-center justify-between p-6 border-b border-[#E5E5E5]">
          <h2 className="text-lg font-semibold text-[#0D0D0D]">Adaugă Produs Nou</h2>
          <button 
            onClick={onClose}
            type="button"
            className="text-neutral-400 hover:text-[#0D0D0D] transition-colors"
           aria-label="Închide"><X className="w-5 h-5" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Nume Produs</label>
            <input 
              name="title"
              type="text" 
              required
              className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20 focus:border-[#0D0D0D] transition-colors"
              placeholder="ex: Tricou Bumbac Organic"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Preț (RON)</label>
              <input 
                name="price"
                type="number" 
                required
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20 focus:border-[#0D0D0D] transition-colors"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Stoc</label>
              <input 
                name="stock"
                type="number" 
                required
                min="0"
                className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20 focus:border-[#0D0D0D] transition-colors"
                placeholder="0"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Descriere</label>
            <textarea 
              name="description"
              rows={4}
              className="w-full px-3 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20 focus:border-[#0D0D0D] transition-colors resize-none"
              placeholder="Descrie produsul tău..."
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-[#0D0D0D] transition-colors"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-medium text-white bg-[#0D0D0D] hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-70 flex items-center gap-2"
            >
              {loading ? "Se salvează..." : "Salvează Produsul"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
