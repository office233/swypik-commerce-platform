import type { Metadata } from "next";
import OrdersListClient from "./OrdersListClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Comenzile mele | Swypik Food",
  description: "Istoricul comenzilor tale de mâncare, cu re-comandă într-un tap.",
};

export default function OrdersPage() {
  return <OrdersListClient />;
}
