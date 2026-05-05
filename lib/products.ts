export type Product = {
  id: string;
  title: string;
  category: string;
  price: number;
  oldPrice: number;
  rating: number;
  reviews: number;
  delivery: string;
  badge: string;
  gradient: string;
  benefits: string[];
  description: string;
};

export const products: Product[] = [
  {
    id: "p1",
    title: "Casti Wireless Sport Pro",
    category: "Tech",
    price: 129,
    oldPrice: 199,
    rating: 4.8,
    reviews: 1245,
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
    reviews: 862,
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
    reviews: 533,
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
    reviews: 418,
    delivery: "9-16 zile",
    badge: "-39%",
    gradient: "from-pink-400 to-purple-500",
    benefits: ["Usor de folosit", "Compacta", "Buna pentru rutina zilnica"],
    description: "Un produs beauty simplu de inteles si potrivit pentru recomandari in chat.",
  },
];

export function getProduct(id: string) {
  return products.find((product) => product.id === id);
}

export function searchProducts(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return products;
  const hits = products.filter((product) => `${product.title} ${product.category}`.toLowerCase().includes(q));
  return hits.length ? hits : products;
}
