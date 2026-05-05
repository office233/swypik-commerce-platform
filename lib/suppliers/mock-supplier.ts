/**
 * Enhanced mock supplier with more realistic product data
 * Will be replaced by real AliExpress API in Phase 2
 */

import { SupplierProduct } from "./types";

const MOCK_PRODUCTS: SupplierProduct[] = [
  {
    source: "mock",
    sourceProductId: "m1",
    sourceUrl: "https://aliexpress.com/item/mock-1",
    title: "Wireless Bluetooth Earbuds Sport TWS",
    description: "Bluetooth 5.3 wireless earbuds with noise cancellation, IPX5 waterproof, 30h battery",
    price: 42,
    shipping: 0,
    currency: "RON",
    rating: 4.8,
    orders: 1250,
    deliveryDays: 12,
    images: ["/products/earbuds-1.jpg", "/products/earbuds-2.jpg"],
    category: "tech",
    variants: [
      { sourceVariantId: "v1a", title: "Negru", options: { color: "Negru" }, price: 42, stockStatus: "in_stock" },
      { sourceVariantId: "v1b", title: "Alb", options: { color: "Alb" }, price: 42, stockStatus: "in_stock" },
    ],
  },
  {
    source: "mock",
    sourceProductId: "m2",
    sourceUrl: "https://aliexpress.com/item/mock-2",
    title: "Mini Portable Car Vacuum Cleaner Wireless",
    description: "Handheld wireless car vacuum cleaner 8000Pa suction, USB-C rechargeable",
    price: 38,
    shipping: 5,
    currency: "RON",
    rating: 4.7,
    orders: 890,
    deliveryDays: 10,
    images: ["/products/vacuum-1.jpg"],
    category: "auto",
    variants: [
      { sourceVariantId: "v2a", title: "Standard", options: { type: "Standard" }, price: 38, stockStatus: "in_stock" },
    ],
  },
  {
    source: "mock",
    sourceProductId: "m3",
    sourceUrl: "https://aliexpress.com/item/mock-3",
    title: "Smart LED Night Light RGB Ambient",
    description: "Touch control ambient light, 16 colors, USB powered, bedroom/gaming desk decoration",
    price: 55,
    shipping: 0,
    currency: "RON",
    rating: 4.9,
    orders: 2100,
    deliveryDays: 14,
    images: ["/products/led-1.jpg", "/products/led-2.jpg", "/products/led-3.jpg"],
    category: "casa",
    variants: [
      { sourceVariantId: "v3a", title: "Sferă", options: { shape: "Sfera" }, price: 55, stockStatus: "in_stock" },
      { sourceVariantId: "v3b", title: "Cub", options: { shape: "Cub" }, price: 55, stockStatus: "in_stock" },
    ],
  },
  {
    source: "mock",
    sourceProductId: "m4",
    sourceUrl: "https://aliexpress.com/item/mock-4",
    title: "Electric Silicone Facial Cleansing Brush",
    description: "Sonic vibration facial cleanser, waterproof, USB rechargeable, deep pore cleaning",
    price: 28,
    shipping: 0,
    currency: "RON",
    rating: 4.6,
    orders: 650,
    deliveryDays: 11,
    images: ["/products/brush-1.jpg"],
    category: "beauty",
    variants: [
      { sourceVariantId: "v4a", title: "Roz", options: { color: "Roz" }, price: 28, stockStatus: "in_stock" },
      { sourceVariantId: "v4b", title: "Alb", options: { color: "Alb" }, price: 28, stockStatus: "in_stock" },
    ],
  },
  {
    source: "mock",
    sourceProductId: "m5",
    sourceUrl: "https://aliexpress.com/item/mock-5",
    title: "Smart Watch Fitness Tracker Heart Rate",
    description: "1.85 inch HD display, heart rate monitor, blood oxygen, 100+ sport modes, IP68 waterproof",
    price: 65,
    shipping: 0,
    currency: "RON",
    rating: 4.7,
    orders: 3400,
    deliveryDays: 13,
    images: ["/products/watch-1.jpg", "/products/watch-2.jpg"],
    category: "fitness",
    variants: [
      { sourceVariantId: "v5a", title: "Negru", options: { color: "Negru" }, price: 65, stockStatus: "in_stock" },
      { sourceVariantId: "v5b", title: "Auriu", options: { color: "Auriu" }, price: 68, stockStatus: "in_stock" },
    ],
  },
  {
    source: "mock",
    sourceProductId: "m6",
    sourceUrl: "https://aliexpress.com/item/mock-6",
    title: "Magnetic Phone Car Mount Holder MagSafe",
    description: "360° rotation, strong magnetic, air vent mount, compatible with all phones",
    price: 22,
    shipping: 0,
    currency: "RON",
    rating: 4.8,
    orders: 5600,
    deliveryDays: 9,
    images: ["/products/mount-1.jpg"],
    category: "auto",
    variants: [
      { sourceVariantId: "v6a", title: "Standard", options: { type: "Air Vent" }, price: 22, stockStatus: "in_stock" },
    ],
  },
  {
    source: "mock",
    sourceProductId: "m7",
    sourceUrl: "https://aliexpress.com/item/mock-7",
    title: "Portable Blender Mini Juicer USB Rechargeable",
    description: "380ml personal blender, 6 blades, USB-C, makes smoothies in 30 seconds",
    price: 35,
    shipping: 0,
    currency: "RON",
    rating: 4.6,
    orders: 780,
    deliveryDays: 15,
    images: ["/products/blender-1.jpg", "/products/blender-2.jpg"],
    category: "casa",
    variants: [
      { sourceVariantId: "v7a", title: "Roz", options: { color: "Roz" }, price: 35, stockStatus: "in_stock" },
      { sourceVariantId: "v7b", title: "Verde", options: { color: "Verde" }, price: 35, stockStatus: "in_stock" },
      { sourceVariantId: "v7c", title: "Alb", options: { color: "Alb" }, price: 35, stockStatus: "in_stock" },
    ],
  },
  {
    source: "mock",
    sourceProductId: "m8",
    sourceUrl: "https://aliexpress.com/item/mock-8",
    title: "LED Strip Light RGB 5M WiFi Smart",
    description: "5 meter RGB LED strip, WiFi control, music sync, voice control Alexa/Google",
    price: 30,
    shipping: 0,
    currency: "RON",
    rating: 4.7,
    orders: 1900,
    deliveryDays: 16,
    images: ["/products/strip-1.jpg"],
    category: "casa",
    variants: [
      { sourceVariantId: "v8a", title: "5M", options: { length: "5M" }, price: 30, stockStatus: "in_stock" },
      { sourceVariantId: "v8b", title: "10M", options: { length: "10M" }, price: 52, stockStatus: "in_stock" },
    ],
  },
];

export function mockSearch(query: string): SupplierProduct[] {
  if (!query || !query.trim()) return MOCK_PRODUCTS;

  const q = query.toLowerCase();
  const keywords = q.split(/\s+/);

  const scored = MOCK_PRODUCTS.map((product) => {
    const text = `${product.title} ${product.description} ${product.category}`.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score += 2;
      // Fuzzy partial match
      if (text.split(/\s+/).some((word) => word.startsWith(kw.slice(0, 3)))) score += 1;
    }
    return { product, score };
  });

  const results = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return results.length ? results.map((r) => r.product) : MOCK_PRODUCTS.slice(0, 4);
}
