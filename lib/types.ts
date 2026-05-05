export type SupplierSource = "mock" | "aliexpress" | "cj" | "syncee";

export type SupplierProduct = {
  source: SupplierSource;
  sourceProductId: string;
  sourceUrl?: string;
  title: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  shipping: number;
  currency: "RON" | "USD" | "EUR";
  rating: number;
  orders: number;
  deliveryDays: number;
  images: string[];
  category: string;
  variants: ProductVariant[];
};

export type ProductVariant = {
  sourceVariantId: string;
  title: string;
  options: Record<string, string>;
  price: number;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock";
};

export type StoreProduct = {
  id: string;
  source: SupplierSource;
  sourceUrl?: string;
  originalTitle: string;
  originalDescription: string;
  title: string;        // AI rewritten
  description: string;  // AI rewritten
  benefits: string[];
  dealLabel: string;
  whyBuy: string;
  warnings: string[];
  price: number;        // sell price
  oldPrice: number;
  discountPercent: number;
  marginPercent: number;
  rating: number;
  orders: number;
  deliveryDays: number;
  images: string[];
  category: string;
  variants: ProductVariant[];
  qualityScore: number;
  gradient: string;
  shopifyProductId?: string;
  createdAt?: string;
};

export type ChatIntent =
  | "search_product"
  | "explain_product"
  | "compare_products"
  | "find_cheaper"
  | "add_to_cart"
  | "track_order"
  | "general_chat";

export type ChatMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  intent?: ChatIntent;
  products?: StoreProduct[];
  createdAt: string;
};

export type ChatSession = {
  id: string;
  userId?: string;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
};
