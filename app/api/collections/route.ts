/**
 * Collections API — Fetches Shopify custom collections
 * Cached in-memory for 5 minutes to avoid hammering the API
 */

import { NextResponse } from "next/server";
import { getShopifyAccessToken } from "@/lib/shopify/auth";

const API_VERSION = "2026-04";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let cachedCollections: any = null;
let cacheTimestamp = 0;

// Emoji mapping for collection titles
const EMOJI_MAP: Record<string, string> = {
  "women's clothing": "👗",
  "men's clothing": "👔",
  "jewelry & watches": "💎",
  "bags & shoes": "👜",
  "pet supplies": "🐾",
  "health, beauty & hair": "💄",
  "toys, kids & babies": "🧸",
  "home, garden & furniture": "🏠",
  "kitchen, dining & bar": "🍳",
  "tops & sets": "👚",
  "home storage": "📦",
  "fashion jewelry": "💍",
  "outerwear & jackets": "🧥",
  "accessories": "🎀",
  "bottoms": "👖",
  "t-shirts": "👕",
  "women's shoes": "👠",
  "men's shoes": "👞",
  "women's luggage & bags": "👝",
  "men's luggage & bags": "🎒",
  "fine jewelry": "💎",
  "skin care": "🧴",
  "pet apparels": "🐕",
  "toys & hobbies": "🎲",
  "underwear & loungewear": "🩳",
  "baby clothing": "👶",
  "pet toys": "🦴",
  "home textiles": "🛏️",
  "nail art & tools": "💅",
  "makeup": "💋",
  "pet furnitures": "🐱",
  "pet collars, harnesses & accessories": "🦮",
  "boys clothing": "👦",
  "festive & party supplies": "🎉",
  "weddings & events": "💒",
  "women's watches": "⌚",
  "men's watches": "⌚",
  "beauty tools": "✨",
  "hats & caps": "🧢",
  "wigs & extensions": "💇",
  "arts, crafts & sewing": "🎨",
  "shoes & bags": "👟",
  "pet outdoor supplies": "🌳",
  "wedding & engagement": "💍",
  "pet bedding": "🛌",
  "pet groomings": "🧹",
  "pet drinking & feeding": "🍽️",
  "hair weaves": "💇",
  "food & health": "🍎",
  "hair & accessories": "💇‍♀️",
  "bird supplies": "🦜",
  "fish & aquatic pets": "🐠",
  "couple&parent-child clothing": "👨‍👩‍👧",
  "synthetic hair": "💇",
};

// Main categories to highlight (top-level popular ones)
const MAIN_CATEGORIES = [
  "Women's Clothing",
  "Men's Clothing",
  "Jewelry & Watches",
  "Health, Beauty & Hair",
  "Home, Garden & Furniture",
  "Bags & Shoes",
  "Toys, Kids & Babies",
  "Pet Supplies",
  "Kitchen, Dining & Bar",
  "Fashion Jewelry",
  "Skin Care",
  "Makeup",
];

export async function GET() {
  try {
    // Return cached if fresh
    if (cachedCollections && Date.now() - cacheTimestamp < CACHE_TTL) {
      return NextResponse.json(cachedCollections);
    }

    const token = await getShopifyAccessToken();
    const store = process.env.SHOPIFY_STORE!;

    // Fetch all custom collections
    const res = await fetch(
      `https://${store}/admin/api/${API_VERSION}/custom_collections.json?limit=250`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Shopify ${res.status}`);
    }

    const data = await res.json();
    const collections = (data.custom_collections || []).map((c: any) => ({
      id: c.id,
      title: c.title,
      handle: c.handle,
      emoji: EMOJI_MAP[c.title.toLowerCase()] || "📦",
      productsCount: c.products_count || 0,
    }));

    // Sort: main categories first, then rest alphabetically
    const mainSet = new Set(MAIN_CATEGORIES.map((m) => m.toLowerCase()));
    const main = collections
      .filter((c: any) => mainSet.has(c.title.toLowerCase()))
      .sort((a: any, b: any) =>
        MAIN_CATEGORIES.indexOf(a.title) - MAIN_CATEGORIES.indexOf(b.title)
      );
    const rest = collections
      .filter((c: any) => !mainSet.has(c.title.toLowerCase()))
      .sort((a: any, b: any) => a.title.localeCompare(b.title));

    const result = {
      main,
      all: [...main, ...rest],
      total: collections.length,
    };

    cachedCollections = result;
    cacheTimestamp = Date.now();

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Collections API]", error.message);
    return NextResponse.json(
      { error: "Failed to fetch collections", main: [], all: [], total: 0 },
      { status: 500 }
    );
  }
}
