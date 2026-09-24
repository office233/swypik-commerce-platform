// Fostul terminal de swap on-chain (tranzacții și solduri simulate) a fost
// eliminat — Swypik Crypto este acum doar o piață informativă, fără execuție
// de tranzacții sau portofel. Orice link vechi către /crypto/swap ajunge pe
// pagina de piață reală.
import { redirect } from "next/navigation";

export default function CryptoSwapRedirectPage() {
  redirect("/crypto/market");
}
