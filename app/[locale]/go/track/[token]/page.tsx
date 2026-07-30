import type { Metadata } from "next";
import TrackClient from "./TrackClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Urmărește cursa — Swypik Go",
  robots: { index: false },
};

export default async function TrackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <TrackClient token={token} />;
}
