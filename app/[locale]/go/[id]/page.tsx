import type { Metadata } from "next";
import RideClient from "./RideClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cursa ta — Swypik Go",
  robots: { index: false },
};

export default async function RidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RideClient rideId={id} />;
}
