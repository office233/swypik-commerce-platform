"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { PiShopProduct } from "../types";

export default function PiSearchClient() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PiShopProduct[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 2) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pi/products?q=${encodeURIComponent(query)}&limit=30`);
      const data = await res.json();
      setResults(data.products || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={run} className="mb-4 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products…"
          className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-[#C9A2DC] focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-[#7D4698] px-4 text-white"
          aria-label="Search"
        >
          <Search className="h-5 w-5" />
        </button>
      </form>

      {loading && <p className="py-8 text-center text-sm text-white/50">Searching…</p>}

      {results !== null && !loading && results.length === 0 && (
        <p className="py-8 text-center text-sm text-white/50">No results.</p>
      )}

      {results && results.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {results.map((p) => (
            <Link
              key={p.id}
              href={`/pi/p/${p.id}`}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
            >
              <div className="aspect-square w-full overflow-hidden bg-white/5">
                {p.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.images[0]} alt={p.title} className="h-full w-full object-cover" loading="lazy" />
                ) : null}
              </div>
              <div className="p-3">
                <p className="line-clamp-2 text-xs text-white/80">{p.title}</p>
                <p className="mt-1 text-sm font-black text-[#C9A2DC]">
                  {p.amountPi == null ? "π —" : `π ${p.amountPi.toFixed(4)}`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
