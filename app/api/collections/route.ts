/**
 * Collections API — Fetches Shopify custom collections
 * Organizes them into parent categories with subcategories
 * Cached in-memory for 5 minutes
 */

import { NextResponse } from "next/server";
import { getShopifyAccessToken } from "@/lib/shopify/auth";

const API_VERSION = "2026-04";
const CACHE_TTL = 5 * 60 * 1000;

let cachedCollections: any = null;
let cacheTimestamp = 0;

/* ─── Category hierarchy ─── */
type CategoryGroup = {
  parent: string;
  emoji: string;
  children: string[]; // collection titles that belong to this parent
};

const CATEGORY_TREE: CategoryGroup[] = [
  {
    parent: "Îmbrăcăminte Femei",
    emoji: "👗",
    children: [
      "Women's Clothing", "Tops & Sets", "Bottoms", "Outerwear & Jackets",
      "Underwear & Loungewear", "T-Shirts",
    ],
  },
  {
    parent: "Îmbrăcăminte Bărbați",
    emoji: "👔",
    children: ["Men's Clothing"],
  },
  {
    parent: "Bijuterii & Ceasuri",
    emoji: "💎",
    children: [
      "Jewelry & Watches", "Fashion Jewelry", "Fine Jewelry",
      "Women's Watches", "Men's Watches", "Wedding & Engagement",
    ],
  },
  {
    parent: "Încălțăminte & Genți",
    emoji: "👜",
    children: [
      "Bags & Shoes", "Shoes & Bags", "Women's Shoes", "Men's Shoes",
      "Women's Luggage & Bags", "Men's Luggage & Bags",
    ],
  },
  {
    parent: "Frumusețe & Sănătate",
    emoji: "💄",
    children: [
      "Health, Beauty & Hair", "Skin Care", "Makeup", "Nail Art & Tools",
      "Beauty Tools", "Wigs & Extensions", "Hair Weaves", "Synthetic Hair",
      "Hair & Accessories", "Food & Health",
    ],
  },
  {
    parent: "Casă & Grădină",
    emoji: "🏠",
    children: [
      "Home, Garden & Furniture", "Home Storage", "Home Textiles",
      "Kitchen, Dining & Bar",
    ],
  },
  {
    parent: "Copii & Jucării",
    emoji: "🧸",
    children: [
      "Toys, Kids & Babies", "Toys & Hobbies", "Baby Clothing",
      "Boys Clothing", "Couple&Parent-Child Clothing",
    ],
  },
  {
    parent: "Animale de Companie",
    emoji: "🐾",
    children: [
      "Pet Supplies", "Pet Apparels", "Pet Toys", "Pet Furnitures",
      "Pet Collars, Harnesses & Accessories", "Pet Outdoor Supplies",
      "Pet Bedding", "Pet Groomings", "Pet Drinking & Feeding",
      "Bird Supplies", "Fish & Aquatic Pets",
    ],
  },
  {
    parent: "Accesorii & Modă",
    emoji: "🎀",
    children: ["Accessories", "Hats & Caps"],
  },
  {
    parent: "Petreceri & Evenimente",
    emoji: "🎉",
    children: [
      "Festive & Party Supplies", "Weddings & Events",
      "Arts, Crafts & Sewing",
    ],
  },
];

// Flat emoji map for individual collections
const EMOJI_MAP: Record<string, string> = {
  "women's clothing": "👗", "men's clothing": "👔", "jewelry & watches": "💎",
  "bags & shoes": "👜", "pet supplies": "🐾", "health, beauty & hair": "💄",
  "toys, kids & babies": "🧸", "home, garden & furniture": "🏠",
  "kitchen, dining & bar": "🍳", "tops & sets": "👚", "home storage": "📦",
  "fashion jewelry": "💍", "outerwear & jackets": "🧥", "accessories": "🎀",
  "bottoms": "👖", "t-shirts": "👕", "women's shoes": "👠", "men's shoes": "👞",
  "women's luggage & bags": "👝", "men's luggage & bags": "🎒",
  "fine jewelry": "💎", "skin care": "🧴", "pet apparels": "🐕",
  "toys & hobbies": "🎲", "underwear & loungewear": "🩳",
  "baby clothing": "👶", "pet toys": "🦴", "home textiles": "🛏️",
  "nail art & tools": "💅", "makeup": "💋", "pet furnitures": "🐱",
  "pet collars, harnesses & accessories": "🦮", "boys clothing": "👦",
  "festive & party supplies": "🎉", "weddings & events": "💒",
  "women's watches": "⌚", "men's watches": "⌚", "beauty tools": "✨",
  "hats & caps": "🧢", "wigs & extensions": "💇",
  "arts, crafts & sewing": "🎨", "shoes & bags": "👟",
  "pet outdoor supplies": "🌳", "wedding & engagement": "💍",
  "pet bedding": "🛌", "pet groomings": "🧹", "pet drinking & feeding": "🍽️",
  "hair weaves": "💇", "food & health": "🍎", "hair & accessories": "💇‍♀️",
  "bird supplies": "🦜", "fish & aquatic pets": "🐠",
  "couple&parent-child clothing": "👨‍👩‍👧", "synthetic hair": "💇",
};

export async function GET() {
  try {
    if (cachedCollections && Date.now() - cacheTimestamp < CACHE_TTL) {
      return NextResponse.json(cachedCollections);
    }

    const token = await getShopifyAccessToken();
    const store = process.env.SHOPIFY_STORE!;

    const res = await fetch(
      `https://${store}/admin/api/${API_VERSION}/custom_collections.json?limit=250`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
      }
    );

    if (!res.ok) throw new Error(`Shopify ${res.status}`);

    const data = await res.json();
    const collections = (data.custom_collections || []).map((c: any) => ({
      id: c.id,
      title: c.title,
      handle: c.handle,
      emoji: EMOJI_MAP[c.title.toLowerCase()] || "📦",
      productsCount: c.products_count || 0,
    }));

    // ── Build hierarchical category tree ──
    const collectionsByTitle = new Map<string, any>();
    collections.forEach((c: any) => collectionsByTitle.set(c.title.toLowerCase(), c));

    const assignedTitles = new Set<string>();
    const grouped = CATEGORY_TREE.map((group) => {
      const subcategories = group.children
        .map((childTitle) => {
          const c = collectionsByTitle.get(childTitle.toLowerCase());
          if (c) assignedTitles.add(c.title.toLowerCase());
          return c;
        })
        .filter(Boolean);

      // Use the first child's ID as the parent collection ID (for filtering)
      const primaryCollection = subcategories[0];

      return {
        parent: group.parent,
        emoji: group.emoji,
        id: primaryCollection?.id || null,
        subcategories,
        totalProducts: subcategories.reduce((sum: number, s: any) => sum + (s.productsCount || 0), 0),
      };
    }).filter((g) => g.subcategories.length > 0);

    // Uncategorized collections
    const uncategorized = collections.filter(
      (c: any) => !assignedTitles.has(c.title.toLowerCase())
    );

    if (uncategorized.length > 0) {
      grouped.push({
        parent: "Altele",
        emoji: "📦",
        id: uncategorized[0]?.id || null,
        subcategories: uncategorized,
        totalProducts: uncategorized.reduce((sum: number, s: any) => sum + (s.productsCount || 0), 0),
      });
    }

    // ── Also keep flat list for backward compatibility ──
    const mainTitles = [
      "Women's Clothing", "Men's Clothing", "Jewelry & Watches",
      "Health, Beauty & Hair", "Home, Garden & Furniture", "Bags & Shoes",
      "Toys, Kids & Babies", "Pet Supplies", "Kitchen, Dining & Bar",
      "Fashion Jewelry", "Skin Care", "Makeup",
    ];
    const mainSet = new Set(mainTitles.map((m) => m.toLowerCase()));
    const main = collections
      .filter((c: any) => mainSet.has(c.title.toLowerCase()))
      .sort((a: any, b: any) => mainTitles.indexOf(a.title) - mainTitles.indexOf(b.title));

    const result = {
      main,
      all: collections,
      grouped, // NEW: hierarchical categories
      total: collections.length,
    };

    cachedCollections = result;
    cacheTimestamp = Date.now();

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Collections API]", error.message);
    return NextResponse.json(
      { error: "Failed to fetch collections", main: [], all: [], grouped: [], total: 0 },
      { status: 500 }
    );
  }
}
