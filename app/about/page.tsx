import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Despre Swypik — Cumpără prin video",
  description: "Swypik este marketplace-ul românesc unde descoperi produse prin clipuri scurte, cu recomandări AI și creatori locali.",
  alternates: { canonical: "https://swypik.com/about" },
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold mb-4">Despre Swypik</h1>
      <p className="text-zinc-700 mb-6">
        Swypik este platforma românească unde cumperi prin video. Descoperi produse în clipuri scurte
        de la creatori reali, primești scoruri de calitate generate de AI și plătești securizat în câteva
        secunde.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">Ce facem diferit</h2>
      <ul className="list-disc pl-6 space-y-2 text-zinc-700">
        <li><strong>Curatare AI:</strong> fiecare produs primește un Swypik Score (1-99) pe baza calității, prețului, livrării și feedback-ului comunității.</li>
        <li><strong>Video-first:</strong> vezi produsul în acțiune înainte să cumperi.</li>
        <li><strong>Creatori locali:</strong> sprijinim creatorii români care recomandă onest.</li>
        <li><strong>Comunitate:</strong> votează „Merită” sau „Nu merită” și ajută alți cumpărători.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 mb-3">Cum funcționează</h2>
      <ol className="list-decimal pl-6 space-y-2 text-zinc-700">
        <li>Descoperi un produs într-un clip pe <Link href="/explore" className="underline">/explore</Link>.</li>
        <li>Verifici scorul Swypik, recenziile și prețul.</li>
        <li>Adaugi în coș și plătești securizat cu Stripe.</li>
        <li>Primești produsul în 5-14 zile, cu retur garantat 14 zile.</li>
      </ol>

      <h2 className="text-xl font-semibold mt-8 mb-3">Contact</h2>
      <p className="text-zinc-700">
        Email: <a className="underline" href="mailto:hello@swypik.com">hello@swypik.com</a><br />
        Suport: <a className="underline" href="mailto:suport@swypik.com">suport@swypik.com</a>
      </p>

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/help" className="underline">Ajutor</Link>
        <Link href="/terms" className="underline">Termeni</Link>
        <Link href="/privacy" className="underline">Confidențialitate</Link>
        <Link href="/become-a-creator" className="underline">Devino creator</Link>
        <Link href="/become-a-seller" className="underline">Devino seller</Link>
      </div>
    </main>
  );
}
