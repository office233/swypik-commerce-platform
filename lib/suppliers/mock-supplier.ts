/**
 * Enhanced mock supplier with REAL product images
 * Uses free image CDNs until AliExpress API is connected
 */

import { SupplierProduct } from "../types";

const MOCK_PRODUCTS: SupplierProduct[] = [
  {
    source: "mock",
    sourceProductId: "m1",
    sourceUrl: "https://aliexpress.com/item/1005006123456.html",
    title: "Wireless Bluetooth Earbuds TWS Sport IPX5",
    description: "Bluetooth 5.3 wireless earbuds with active noise cancellation, IPX5 waterproof rating, 30 hour total battery life with charging case, touch controls, built-in microphone for calls",
    price: 42,
    shipping: 0,
    currency: "RON",
    rating: 4.8,
    orders: 12500,
    deliveryDays: 12,
    images: [
      "https://images.unsplash.com/photo-1590658268037-6bf12f032f55?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=400&h=400&fit=crop",
    ],
    category: "tech",
    variants: [
      { sourceVariantId: "v1a", title: "Negru", options: { color: "Negru" }, price: 42, stockStatus: "in_stock" },
      { sourceVariantId: "v1b", title: "Alb", options: { color: "Alb" }, price: 42, stockStatus: "in_stock" },
    ],
  },
  {
    source: "mock",
    sourceProductId: "m2",
    sourceUrl: "https://aliexpress.com/item/1005006234567.html",
    title: "Mini Portable Car Vacuum Cleaner 8000Pa Wireless",
    description: "Handheld wireless car vacuum cleaner with 8000Pa powerful suction, HEPA filter, USB-C fast rechargeable, lightweight design, includes multiple nozzle attachments for car interior cleaning",
    price: 38,
    shipping: 5,
    currency: "RON",
    rating: 4.7,
    orders: 8900,
    deliveryDays: 10,
    images: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1527515637462-cee1395c2a44?w=400&h=400&fit=crop",
    ],
    category: "auto",
    variants: [
      { sourceVariantId: "v2a", title: "Standard", options: { type: "Standard" }, price: 38, stockStatus: "in_stock" },
    ],
  },
  {
    source: "mock",
    sourceProductId: "m3",
    sourceUrl: "https://aliexpress.com/item/1005006345678.html",
    title: "Smart LED Night Light RGB 16 Colors Touch Control",
    description: "Ambient LED lamp with 16 RGB colors, touch control, USB powered, perfect for bedroom, gaming desk decoration, living room ambiance. Smooth color transitions and adjustable brightness.",
    price: 55,
    shipping: 0,
    currency: "RON",
    rating: 4.9,
    orders: 21000,
    deliveryDays: 14,
    images: [
      "https://images.unsplash.com/photo-1507473885765-e6ed057ab6fe?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1543332164-6e21c0da9852?w=400&h=400&fit=crop",
    ],
    category: "casa",
    variants: [
      { sourceVariantId: "v3a", title: "Sferă", options: { shape: "Sfera" }, price: 55, stockStatus: "in_stock" },
      { sourceVariantId: "v3b", title: "Cub", options: { shape: "Cub" }, price: 55, stockStatus: "in_stock" },
    ],
  },
  {
    source: "mock",
    sourceProductId: "m4",
    sourceUrl: "https://aliexpress.com/item/1005006456789.html",
    title: "Electric Sonic Facial Cleansing Brush IPX7",
    description: "Silicone sonic vibration facial cleanser with 5 modes, IPX7 waterproof, USB rechargeable, deep pore cleaning, gentle exfoliation for all skin types including sensitive skin",
    price: 28,
    shipping: 0,
    currency: "RON",
    rating: 4.6,
    orders: 6500,
    deliveryDays: 11,
    images: [
      "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=400&fit=crop",
    ],
    category: "beauty",
    variants: [
      { sourceVariantId: "v4a", title: "Roz", options: { color: "Roz" }, price: 28, stockStatus: "in_stock" },
      { sourceVariantId: "v4b", title: "Alb", options: { color: "Alb" }, price: 28, stockStatus: "in_stock" },
    ],
  },
  {
    source: "mock",
    sourceProductId: "m5",
    sourceUrl: "https://aliexpress.com/item/1005006567890.html",
    title: "Smart Watch 1.85 HD Fitness Tracker IP68",
    description: "1.85 inch full HD display smartwatch with heart rate monitor, blood oxygen SpO2, 100+ sport modes, IP68 waterproof, sleep tracking, step counter, 7 day battery life, compatible with iOS and Android",
    price: 65,
    shipping: 0,
    currency: "RON",
    rating: 4.7,
    orders: 34000,
    deliveryDays: 13,
    images: [
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1546868871-af0de0ae72be?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=400&h=400&fit=crop",
    ],
    category: "fitness",
    variants: [
      { sourceVariantId: "v5a", title: "Negru", options: { color: "Negru" }, price: 65, stockStatus: "in_stock" },
      { sourceVariantId: "v5b", title: "Auriu", options: { color: "Auriu" }, price: 68, stockStatus: "in_stock" },
    ],
  },
  {
    source: "mock",
    sourceProductId: "m6",
    sourceUrl: "https://aliexpress.com/item/1005006678901.html",
    title: "Magnetic Phone Car Mount MagSafe 360 Rotation",
    description: "Super strong magnetic phone holder for car air vent, 360 degree rotation, MagSafe compatible, one-hand operation, universal fit for all smartphones, stable even on rough roads",
    price: 22,
    shipping: 0,
    currency: "RON",
    rating: 4.8,
    orders: 56000,
    deliveryDays: 9,
    images: [
      "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400&h=400&fit=crop",
    ],
    category: "auto",
    variants: [
      { sourceVariantId: "v6a", title: "Standard", options: { type: "Air Vent" }, price: 22, stockStatus: "in_stock" },
    ],
  },
  {
    source: "mock",
    sourceProductId: "m7",
    sourceUrl: "https://aliexpress.com/item/1005006789012.html",
    title: "Portable Blender Mini Juicer 380ml USB-C",
    description: "Personal blender with 6 stainless steel blades, 380ml capacity, USB-C rechargeable, makes fresh smoothies and juices in 30 seconds, BPA-free materials, perfect for gym, office and travel",
    price: 35,
    shipping: 0,
    currency: "RON",
    rating: 4.6,
    orders: 7800,
    deliveryDays: 15,
    images: [
      "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?w=400&h=400&fit=crop",
    ],
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
    sourceUrl: "https://aliexpress.com/item/1005006890123.html",
    title: "LED Strip Light RGB 5M WiFi Music Sync Alexa",
    description: "5 meter RGB LED strip with WiFi smart control, music sync mode, voice control via Alexa and Google Home, 44 key remote, 16 million colors, easy adhesive installation, cuttable design",
    price: 30,
    shipping: 0,
    currency: "RON",
    rating: 4.7,
    orders: 19000,
    deliveryDays: 16,
    images: [
      "https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&h=400&fit=crop",
    ],
    category: "casa",
    variants: [
      { sourceVariantId: "v8a", title: "5M", options: { length: "5M" }, price: 30, stockStatus: "in_stock" },
      { sourceVariantId: "v8b", title: "10M", options: { length: "10M" }, price: 52, stockStatus: "in_stock" },
    ],
  },
  {
    source: "mock",
    sourceProductId: "m9",
    sourceUrl: "https://aliexpress.com/item/1005006901234.html",
    title: "Wireless Charging Pad 15W Fast Charge MagSafe",
    description: "15W fast wireless charger with MagSafe alignment, LED indicator, anti-slip silicone base, overcharge protection, compatible with iPhone 15/14/13, Samsung Galaxy, AirPods Pro",
    price: 25,
    shipping: 0,
    currency: "RON",
    rating: 4.8,
    orders: 42000,
    deliveryDays: 11,
    images: [
      "https://images.unsplash.com/photo-1586816879360-004f5b0c51e3?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400&h=400&fit=crop",
    ],
    category: "tech",
    variants: [
      { sourceVariantId: "v9a", title: "Negru", options: { color: "Negru" }, price: 25, stockStatus: "in_stock" },
      { sourceVariantId: "v9b", title: "Alb", options: { color: "Alb" }, price: 25, stockStatus: "in_stock" },
    ],
  },
  {
    source: "mock",
    sourceProductId: "m10",
    sourceUrl: "https://aliexpress.com/item/1005006012345.html",
    title: "Electric Neck Massager Pulse Cervical TENS",
    description: "Intelligent neck massager with TENS pulse technology, 6 modes, 15 intensity levels, USB-C rechargeable, lightweight design at only 50g, 3D electrode pads for deep muscle relief",
    price: 48,
    shipping: 0,
    currency: "RON",
    rating: 4.7,
    orders: 15600,
    deliveryDays: 14,
    images: [
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=400&h=400&fit=crop",
    ],
    category: "fitness",
    variants: [
      { sourceVariantId: "v10a", title: "Alb", options: { color: "Alb" }, price: 48, stockStatus: "in_stock" },
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
      if (text.split(/\s+/).some((word) => word.startsWith(kw.slice(0, 3)))) score += 1;
    }
    return { product, score };
  });

  const results = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return results.length ? results.map((r) => r.product) : MOCK_PRODUCTS.slice(0, 4);
}
