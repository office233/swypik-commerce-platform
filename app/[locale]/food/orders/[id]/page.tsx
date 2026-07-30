import type { Metadata } from "next";
import OrderTrackingClient from "./OrderTrackingClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Urmărește comanda | Swypik Food",
  description: "Statusul live al comenzii tale: preparare, curier, livrare.",
};

export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderTrackingClient orderId={id} />;
}
