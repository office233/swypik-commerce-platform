// Shared types for the Pi-only shop shell.

export type PiShopProduct = {
  id: string;
  title: string;
  description: string;
  images: string[];
  amountPi: number | null;
  rating: number | null;
  orders: number | null;
  category: string | null;
  deliveryDays: number | null;
};
