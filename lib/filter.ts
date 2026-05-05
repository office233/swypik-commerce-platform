import { SupplierProduct } from "./types";

export function filterProducts(products: SupplierProduct[]) {
  return products.filter((p) => {
    return (
      p.rating >= 4.5 &&
      p.orders >= 100 &&
      p.deliveryDays <= 25 &&
      p.images.length >= 1
    );
  });
}
