"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, SlidersHorizontal, Star, Truck, X, ChevronDown, ChevronUp, ShoppingCart, Loader2, Package } from "lucide-react";

type Product = {
  id: string; pgId?: number; title: string; price: number; oldPrice: number;
  discountPercent: number; rating: number; orders: number; images: string[];
  category: string; shipFree: boolean; deliveryDays: number;
  socialProofLabel?: string; commerceBadge?: string; dealLabel?: string;
};
type HierarchyRoot = { id: string; name: string; count: number; children: { id: string; name: string; count: number }[] };

const SORT_OPTIONS = [
  { value: "popular", label: "Popular" },
  { value: "price_asc", label: "Pret ↑" },
  { value: "price_desc", label: "Pret ↓" },
  { value: "newest", label: "Recent" },
] as const;

const RATING_OPTIONS = [4.5, 4, 3] as const;

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [hierarchy, setHierarchy] = useState<HierarchyRoot[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [suggestions, setSuggestions] = useState<{ label: string; type: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sort, setSort] = useState("popular");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [expandedRoot, setExpandedRoot] = useState<string | null>(null);
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(2000);
  const [minRating, setMinRating] = useState(0);
  const [freeShipOnly, setFreeShipOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [offset, setOffset] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const LIMIT = 40;

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // fetch categories
  useEffect(() => {
    fetch("/api/categories").then(r => r.json()).then(d => {
      if (d.hierarchy) setHierarchy(d.hierarchy);
    }).catch(() => {});
  }, []);

  // search suggestions
  useEffect(() => {
    if (search.length < 2) { setSuggestions([]); return; }
    const ac = new AbortController();
    fetch(`/api/search/suggest?q=${encodeURIComponent(search)}&limit=6`, { signal: ac.signal })
      .then(r => r.json()).then(d => { if (d.suggestions) setSuggestions(d.suggestions); })
      .catch(() => {});
    return () => ac.abort();
  }, [search]);

  // build query string
  const buildQuery = useCallback((off: number) => {
    const p = new URLSearchParams();
    p.set("limit", String(LIMIT));
    p.set("offset", String(off));
    if (sort) p.set("sort", sort);
    if (debouncedSearch) p.set("q", debouncedSearch);
    if (selectedCategory) p.set("tag", selectedCategory);
    if (minPrice > 0) p.set("minPrice", String(minPrice));
    if (maxPrice < 2000) p.set("maxPrice", String(maxPrice));
    return `/api/products?${p.toString()}`;
  }, [sort, debouncedSearch, selectedCategory, minPrice, maxPrice]);

  // fetch products
  useEffect(() => {
    setLoading(true);
    setOffset(0);
    fetch(buildQuery(0))
      .then(r => r.json())
      .then(d => {
        let prods = d.products || [];
        if (minRating > 0) prods = prods.filter((p: Product) => p.rating >= minRating);
        if (freeShipOnly) prods = prods.filter((p: Product) => p.shipFree);
        setProducts(prods);
        setTotal(d.total || 0);
        setOffset(LIMIT);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [buildQuery, minRating, freeShipOnly]);

  // load more
  const loadMore = useCallback(() => {
    if (loadingMore || offset >= total) return;
    setLoadingMore(true);
    fetch(buildQuery(offset))
      .then(r => r.json())
      .then(d => {
        let prods = d.products || [];
        if (minRating > 0) prods = prods.filter((p: Product) => p.rating >= minRating);
        if (freeShipOnly) prods = prods.filter((p: Product) => p.shipFree);
        setProducts(prev => [...prev, ...prods]);
        setOffset(prev => prev + LIMIT);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [buildQuery, offset, total, loadingMore, minRating, freeShipOnly]);

  // infinite scroll observer
  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { threshold: 0.1 });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [loadMore]);

  const selectSuggestion = (label: string) => {
    setSearch(label);
    setDebouncedSearch(label);
    setShowSuggestions(false);
  };

  const toggleCategory = (tagId: string) => {
    setSelectedCategory(prev => prev === tagId ? "" : tagId);
  };

  const clearFilters = () => {
    setSearch(""); setDebouncedSearch(""); setSelectedCategory("");
    setMinPrice(0); setMaxPrice(2000); setMinRating(0);
    setFreeShipOnly(false); setSort("popular");
  };

  const hasActiveFilters = selectedCategory || minPrice > 0 || maxPrice < 2000 || minRating > 0 || freeShipOnly || debouncedSearch;

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a", color: "#e5e5e5" }}>
      {/* HEADER */}
      <header className="sticky top-0 z-40" style={{ background: "rgba(10,10,10,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="shrink-0 text-xl font-black" style={{ color: "#10A37F" }}>Swypik</Link>
            {/* Search */}
            <div className="relative flex-1 max-w-xl min-w-0">
              <div className="flex items-center rounded-2xl px-2 py-2.5 sm:px-4" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <Search size={18} className="mr-2 shrink-0" style={{ color: "#888" }} />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={e => { setSearch(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Cauta produse..."
                  className="w-full bg-transparent text-sm outline-none placeholder:text-[#666]"
                  style={{ color: "#e5e5e5" }}
                />
                {search && (
                  <button onClick={() => { setSearch(""); setDebouncedSearch(""); }} className="ml-1"><X size={16} style={{ color: "#666" }} /></button>
                )}
              </div>
              {/* Suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 rounded-xl py-1 z-50 overflow-hidden" style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
                  {suggestions.map((s, i) => (
                    <button key={i} onMouseDown={() => selectSuggestion(s.label)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-white/5 transition-colors">
                      <Search size={14} style={{ color: "#10A37F" }} />
                      <span className="flex-1 truncate">{s.label}</span>
                      <span className="text-[10px] rounded-full px-2 py-0.5" style={{ background: "rgba(16,163,127,0.15)", color: "#10A37F" }}>{s.type}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Filter toggle mobile */}
            <button onClick={() => setShowFilters(!showFilters)} className="lg:hidden flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors" style={{ background: showFilters ? "#10A37F" : "rgba(255,255,255,0.07)", color: showFilters ? "#fff" : "#ccc" }}>
              <SlidersHorizontal size={16} /> Filtre
            </button>
          </div>
          {/* Sort bar */}
          <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {SORT_OPTIONS.map(s => (
              <button key={s.value} onClick={() => setSort(s.value)} className="shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all" style={{ background: sort === s.value ? "#10A37F" : "rgba(255,255,255,0.06)", color: sort === s.value ? "#fff" : "#999" }}>
                {s.label}
              </button>
            ))}
            <span className="ml-auto shrink-0 text-xs" style={{ color: "#666" }}>{total.toLocaleString()} produse</span>
          </div>
        </div>
      </header>

       <div className="mx-auto max-w-7xl px-3 py-4 flex gap-4 sm:px-4 sm:py-6 lg:gap-6">
        {/* SIDEBAR */}
        <aside className={`${showFilters ? "fixed inset-0 z-50 overflow-y-auto p-4 pt-16 safe-pb" : "hidden"} lg:block lg:sticky lg:top-28 lg:h-fit lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:max-h-[calc(100vh-8rem)]`} style={{ background: showFilters ? "#0a0a0a" : "transparent" }}>
          {showFilters && (
            <button onClick={() => setShowFilters(false)} className="absolute top-4 right-4 lg:hidden p-2 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}><X size={20} /></button>
          )}
          <div className="space-y-5">
            {/* Categories */}
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="mb-3 text-sm font-bold" style={{ color: "#ccc" }}>Categorii</h3>
              <div className="space-y-1 max-h-80 overflow-y-auto no-scrollbar">
                {hierarchy.map(root => (
                  <div key={root.id}>
                    <button onClick={() => setExpandedRoot(expandedRoot === root.id ? null : root.id)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors hover:bg-white/5" style={{ color: expandedRoot === root.id ? "#10A37F" : "#aaa" }}>
                      <span className="truncate">{root.name}</span>
                      <span className="flex items-center gap-1">
                        <span className="text-[10px]" style={{ color: "#666" }}>{root.count}</span>
                        {expandedRoot === root.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </button>
                    {expandedRoot === root.id && (
                      <div className="ml-2 mt-1 space-y-0.5 animate-slideDown">
                        {root.children.slice(0, 15).map(child => (
                          <button key={child.id} onClick={() => { toggleCategory(child.id); if (showFilters) setShowFilters(false); }} className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] transition-colors" style={{ background: selectedCategory === child.id ? "rgba(16,163,127,0.15)" : "transparent", color: selectedCategory === child.id ? "#10A37F" : "#888" }}>
                            <span className="truncate">{child.name}</span>
                            <span className="text-[10px]" style={{ color: "#555" }}>{child.count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Price */}
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="mb-3 text-sm font-bold" style={{ color: "#ccc" }}>Pret (RON)</h3>
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={maxPrice} value={minPrice} onChange={e => setMinPrice(Number(e.target.value))} className="w-full rounded-lg px-3 py-2 text-xs outline-none" style={{ background: "rgba(255,255,255,0.06)", color: "#e5e5e5", border: "1px solid rgba(255,255,255,0.08)" }} placeholder="Min" />
                <span style={{ color: "#555" }}>-</span>
                <input type="number" min={minPrice} max={5000} value={maxPrice} onChange={e => setMaxPrice(Number(e.target.value))} className="w-full rounded-lg px-3 py-2 text-xs outline-none" style={{ background: "rgba(255,255,255,0.06)", color: "#e5e5e5", border: "1px solid rgba(255,255,255,0.08)" }} placeholder="Max" />
              </div>
              <input type="range" min={0} max={2000} step={10} value={maxPrice} onChange={e => setMaxPrice(Number(e.target.value))} className="mt-3 w-full accent-[#10A37F]" />
              <div className="mt-1 flex justify-between text-[10px]" style={{ color: "#666" }}><span>0 lei</span><span>{maxPrice} lei</span></div>
            </div>

            {/* Rating */}
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="mb-3 text-sm font-bold" style={{ color: "#ccc" }}>Rating minim</h3>
              <div className="space-y-1">
                {RATING_OPTIONS.map(r => (
                  <button key={r} onClick={() => setMinRating(minRating === r ? 0 : r)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors" style={{ background: minRating === r ? "rgba(16,163,127,0.15)" : "transparent", color: minRating === r ? "#10A37F" : "#999" }}>
                    <Star size={13} fill={minRating === r ? "#10A37F" : "none"} /> {r}+ stele
                  </button>
                ))}
              </div>
            </div>

            {/* Free shipping */}
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" checked={freeShipOnly} onChange={() => setFreeShipOnly(!freeShipOnly)} className="sr-only peer" />
                  <div className="h-6 w-11 rounded-full transition-colors peer-checked:bg-[#10A37F]" style={{ background: freeShipOnly ? "#10A37F" : "rgba(255,255,255,0.1)" }} />
                  <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-md" style={{ transform: freeShipOnly ? "translateX(20px)" : "translateX(0)" }} />
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: freeShipOnly ? "#10A37F" : "#999" }}>
                  <Truck size={14} /> Livrare gratuita
                </div>
              </label>
            </div>

            {hasActiveFilters && (
              <button onClick={clearFilters} className="w-full rounded-xl py-2.5 text-xs font-bold transition-colors" style={{ background: "rgba(239,68,68,0.15)", color: "#EF4444" }}>
                Sterge filtrele
              </button>
            )}
          </div>
        </aside>

        {/* PRODUCT GRID */}
        <main className="flex-1 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Loader2 size={32} className="mx-auto animate-spin" style={{ color: "#10A37F" }} />
                <p className="mt-3 text-sm" style={{ color: "#666" }}>Se incarca produsele...</p>
              </div>
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Package size={48} style={{ color: "#333" }} />
              <p className="mt-4 font-bold" style={{ color: "#666" }}>Niciun produs gasit</p>
              <button onClick={clearFilters} className="mt-3 rounded-xl px-6 py-2 text-sm font-bold" style={{ background: "#10A37F", color: "#fff" }}>Reseteaza filtrele</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 md:gap-4">
                {products.map(product => (
                  <Link key={product.id} href={`/product/${product.id}`} className="group rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    {/* Image */}
                    <div className="relative aspect-square overflow-hidden" style={{ background: "#111" }}>
                      {product.images[0] ? (
                        <Image src={product.images[0]} alt={product.title} fill sizes="(max-width:640px) 50vw,(max-width:1024px) 33vw,25vw" className="object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center"><Package size={32} style={{ color: "#333" }} /></div>
                      )}
                      {/* Badges */}
                      <div className="absolute top-2 left-2 flex flex-col gap-1">
                        {product.discountPercent > 0 && (
                          <span className="rounded-lg px-2 py-0.5 text-[10px] font-black text-white" style={{ background: "#EF4444" }}>-{product.discountPercent}%</span>
                        )}
                        {product.shipFree && (
                          <span className="rounded-lg px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(16,163,127,0.9)", color: "#fff" }}>Free Ship</span>
                        )}
                      </div>
                      {product.commerceBadge && (
                        <span className="absolute top-2 right-2 rounded-lg px-2 py-0.5 text-[10px] font-bold backdrop-blur-md" style={{ background: "rgba(0,0,0,0.5)", color: "#F59E0B" }}>{product.commerceBadge}</span>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-3">
                      <h3 className="line-clamp-2 text-xs font-semibold leading-snug mb-2" style={{ color: "#e5e5e5" }}>{product.title}</h3>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Star size={12} fill="#F59E0B" style={{ color: "#F59E0B" }} />
                        <span className="text-[11px] font-bold" style={{ color: "#F59E0B" }}>{product.rating}</span>
                        {product.orders > 0 && <span className="text-[10px]" style={{ color: "#666" }}>({product.orders}+)</span>}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-black" style={{ color: "#10A37F" }}>{product.price} lei</span>
                        {product.oldPrice > product.price && (
                          <span className="text-[11px] line-through" style={{ color: "#555" }}>{product.oldPrice} lei</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              {/* Sentinel for infinite scroll */}
              <div ref={sentinelRef} className="h-10" />
              {loadingMore && (
                <div className="flex justify-center py-6">
                  <Loader2 size={24} className="animate-spin" style={{ color: "#10A37F" }} />
                </div>
              )}
              {offset >= total && products.length > 0 && (
                <p className="py-8 text-center text-xs" style={{ color: "#444" }}>Ai vazut toate cele {total.toLocaleString()} produse</p>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
