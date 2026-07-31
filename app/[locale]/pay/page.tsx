import type { Metadata } from "next";
import PayClient from "./PayClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Swypik Pay — Moneda SWYP | Swypik",
  description:
    "Câștigă SWYP din mining zilnic, curse, livrări și clipuri. Supply fix de 10 miliarde, trezorerie publică, ledger auditabil.",
};

export default function PayPage() {
  return <PayClient />;
}
