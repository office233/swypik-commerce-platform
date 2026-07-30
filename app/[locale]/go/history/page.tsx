import type { Metadata } from "next";
import HistoryClient from "./HistoryClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cursele mele — Swypik Go",
  robots: { index: false },
};

export default function GoHistoryPage() {
  return <HistoryClient />;
}
