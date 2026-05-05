export type SupplierSource = "mock" | "autods" | "aliexpress" | "cj" | "syncee";

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

export type StoreProduct = SupplierProduct & {
  aiTitle: string;
  aiDescription: string;
  benefits: string[];
  sellPrice: number;
  discountPercent: number;
  marginPercent: number;
  score: number;
  dealLabel: string;
};

export type ChatIntent =
  | "search_product"
  | "compare_products"
  | "explain_product"
  | "find_cheaper"
  | "add_to_cart"
  | "track_order"
  | "refund_help";

export type ChatResponse = {
  intent: ChatIntent;
  reply: string;
  products: StoreProduct[];
};
