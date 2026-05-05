"use client";

import { useMemo, useState } from "react";
import { Bot, ChevronRight, Home, MessageCircle, Search, ShoppingBag, Sparkles, Star, Tag, Zap } from "lucide-react";

type Product = {
  id: string;
  title: string;
  category: string;
  price: number;
  oldPrice: number;
  rating: number;
  delivery: string;
  badge: string;
  gradient: string;
  benefits: string[];
  description: string;
};

const products: Product[] = [
  {
    id: "p1",
    title: "Casti Wireless Sport Pro",
    category: "Tech",
    price: 129,
    oldPrice: 199,
    rating: 4.8,
    delivery: "8-15 zile",
    badge: "-35%",
    gradient: "from-violet-500 to-cyan-400",
    benefits: ["Bluetooth stabil", "Rezistente la transpiratie", "Baterie pentru o zi intreaga"],
    description: "Recomandate pentru sport, apeluri si muzica zilnica. AI-ul le alege pentru raport bun intre pret, rating si livrare.",
  },
  {
    id: "p2",
    title: "Mini Aspirator Auto Turbo",
    category: "Auto",
    price: 99,
    oldPrice: 159,
    rating: 4.7,
    delivery: "7-14 zile",
    badge: "Best deal",
    gradient: "from-amber-400 to-rose-500",
    benefits: ["Compact", "Putere buna", "Ideal pentru masina"],
    description: "Un produs practic pentru masina, usor de vandut ca oferta rapida si cadou util.",
  },
  {
    id: "p3",
    title: "Lampa LED Smart Ambientala",
    category: "Casa",
    price: 149,
    oldPrice: 229,
    rating: 4.9,
    delivery: "10-18 zile",
    badge: "Popular",
    gradient: "from-fuchsia-500 to-blue-500",
    benefits: ["Lumina reglabila", "Design modern", "Buna pentru camera sau birou"],
    description: "AI-ul o recomanda pentru decor, gaming setup si cadouri accesibile.",
  },
  {
    id: "p4",
    title: "Perie Facial Clean Glow",
    category: "Beauty",
    price: 79,
    oldPrice: 129,
    rating: 4.6,
    delivery: "9-16 zile",
    badge: "-39%",
    gradient: "from-pink-400 to-purple-500",
    benefits: ["Usor de folosit", "Compacta", "Buna pentru rutina zilnica"],
    description: "Un produs beauty simplu de inteles si potrivit pentru recomandari in chat.",
  },
];

const categories = ["Reduceri", "Tech", "Casa", "Beauty", "Fitness", "Auto", "Cadouri", "Gadgeturi"];

export default function StorefrontApp() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [searched, setSearched] = useState(false);

  const filteredProducts = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.toLowerCase();
    const hits = products.filter((p) => `${p.title} ${p.category}`.toLowerCase().includes(q));
    return hits.length ? hits : products;
  }, [query]);

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="mx-auto min-h-screen max-w-md overflow-hidden bg-[radial-gradient(circle_at_top,#23124d_0,#050507_42%)] pb-24">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-black/40 px-4 py-4 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xl font-black tracking-tight">
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white text-black">AI</span>
                CeVrei.ro
              </div>
              <p className="mt-1 text-xs text-white/55">Shopping cu AI pentru Romania</p>
            </div>
            <button className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold">Cos 0</button>
          </div>
        </header>

        <section className="px-4 pt-6">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-glow backdrop-blur-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <Sparkles size={14} /> Gaseste deal-ul, nu doar produsul
            </div>
            <h1 className="text-4xl font-black leading-[0.95] tracking-tight">
              Spune-mi ce vrei si iti gasesc oferta buna.
            </h1>
            <p className="mt-3 text-sm text-white/60">Cauta produse, reduceri, alternative mai ieftine si recomandari explicate simplu.</p>

            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 p-3">
              <Search className="text-white/50" size={20} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setSearched(true)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-white/35"
                placeholder="Ex: casti wireless sub 150 lei"
              />
            </div>
            <button onClick={() => setSearched(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 px-5 py-4 font-black text-black">
              Cauta cu AI <Zap size={18} />
            </button>
          </div>
        </section>

        <section className="mt-5 px-4">
          <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
            {categories.map((cat) => (
              <button key={cat} className="shrink-0 rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-sm font-semibold text-white/80">
                {cat}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-4 px-4">
          <div className="rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-500/15 to-cyan-400/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-violet-200">
              <Bot size={18} /> AI raspunde
            </div>
            <p className="text-sm text-white/75">
              {searched ? "Am gasit cateva oferte filtrate dupa pret, rating si livrare. Alege una sau cere o alternativa mai ieftina." : "Scrie ce produs cauti, iar eu iti afisez cele mai bune optiuni."}
            </p>
          </div>
        </section>

        <section className="mt-6 px-4">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-black">Reduceri azi</h2>
              <p className="text-xs text-white/45">Selectate pentru marja, rating si livrare</p>
            </div>
            <button className="flex items-center gap-1 text-xs font-bold text-cyan-300">Vezi tot <ChevronRight size={14} /></button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map((product) => (
              <button key={product.id} onClick={() => setSelected(product)} className="group overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-2 text-left shadow-xl transition active:scale-[0.98]">
                <div className={`relative mb-3 grid h-32 place-items-center rounded-[1.2rem] bg-gradient-to-br ${product.gradient}`}>
                  <ShoppingBag className="text-black/55" size={42} />
                  <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-black text-white">{product.badge}</span>
                </div>
                <div className="px-1 pb-1">
                  <p className="line-clamp-2 min-h-10 text-sm font-bold leading-tight">{product.title}</p>
                  <div className="mt-2 flex items-center gap-1 text-xs text-amber-300"><Star size={13} fill="currentColor" /> {product.rating}</div>
                  <div className="mt-2 flex items-end justify-between">
                    <div>
                      <p className="text-[11px] text-white/35 line-through">{product.oldPrice} lei</p>
                      <p className="text-lg font-black text-white">{product.price} lei</p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-black">Vezi</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6 px-4">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Best deal engine</p>
                <h3 className="mt-1 text-lg font-black">Cauta varianta mai ieftina</h3>
              </div>
              <Tag className="text-cyan-300" />
            </div>
            <p className="mt-2 text-sm text-white/55">Pregatit pentru AutoDS, AliExpress, CJdropshipping si Shopify checkout.</p>
          </div>
        </section>

        <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-white/10 bg-black/70 px-5 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-around text-xs text-white/55">
            <button className="flex flex-col items-center gap-1 text-white"><Home size={20} /> Acasa</button>
            <button className="flex flex-col items-center gap-1"><MessageCircle size={20} /> Chat</button>
            <button className="flex flex-col items-center gap-1"><Tag size={20} /> Deals</button>
            <button className="flex flex-col items-center gap-1"><ShoppingBag size={20} /> Cos</button>
          </div>
        </nav>

        {selected && (
          <div className="fixed inset-0 z-40 bg-black/70 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
            <div className="mx-auto mt-10 max-w-md rounded-[2rem] border border-white/10 bg-[#0b0b10] p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className={`grid h-56 place-items-center rounded-[1.5rem] bg-gradient-to-br ${selected.gradient}`}>
                <ShoppingBag className="text-black/55" size={64} />
              </div>
              <div className="mt-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black leading-tight">{selected.title}</h2>
                  <p className="mt-1 text-sm text-white/50">Livrare estimata: {selected.delivery}</p>
                </div>
                <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-300">{selected.badge}</span>
              </div>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-3xl font-black">{selected.price} lei</span>
                <span className="pb-1 text-sm text-white/35 line-through">{selected.oldPrice} lei</span>
              </div>
              <p className="mt-4 text-sm text-white/65">{selected.description}</p>
              <div className="mt-4 space-y-2">
                {selected.benefits.map((benefit) => (
                  <div key={benefit} className="rounded-2xl bg-white/[0.06] px-3 py-2 text-sm">✓ {benefit}</div>
                ))}
              </div>
              <button className="mt-5 w-full rounded-2xl bg-white px-5 py-4 font-black text-black">Adauga in cos</button>
              <button className="mt-2 w-full rounded-2xl border border-white/10 px-5 py-4 font-bold text-white/75">Cauta alternativa mai ieftina</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
