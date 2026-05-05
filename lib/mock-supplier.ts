import { SupplierProduct } from "./types";

export function mockSearch(query: string): SupplierProduct[] {
  return [
    {
      source: "mock",
      sourceProductId: "1",
      title: "Căști wireless sport",
      description: "Căști Bluetooth pentru sport",
      price: 40,
      shipping: 0,
      currency: "RON",
      rating: 4.8,
      orders: 1200,
      deliveryDays: 12,
      images: [""],
      category: "tech",
      variants: [],
    },
    {
      source: "mock",
      sourceProductId: "2",
      title: "Căști bass premium",
      description: "Sunet puternic și clar",
      price: 55,
      shipping: 0,
      currency: "RON",
      rating: 4.7,
      orders: 900,
      deliveryDays: 10,
      images: [""],
      category: "tech",
      variants: [],
    },
  ];
}
