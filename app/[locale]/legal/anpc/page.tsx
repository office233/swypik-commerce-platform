/**
 * Protecția consumatorului — ANPC, SAL și SOL.
 *
 * Afișarea acestor informații și linkuri este OBLIGATORIE pentru comercianții
 * online din România (OG 21/1992, Legea 365/2002) și din UE (Reg. 524/2013,
 * care cere link direct către platforma SOL).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = {
    title: "Protecția consumatorului — Swypik",
    description:
        "Drepturile tale ca și consumator, cum ne poți reclama și autoritățile la care te poți adresa: ANPC, SAL și platforma europeană SOL.",
};

const CHANNELS = [
    {
        name: "Suport Swypik",
        detail: "Primul pas — rezolvăm majoritatea problemelor direct.",
        action: SUPPORT_EMAIL,
        href: `mailto:${SUPPORT_EMAIL}`,
        note: "Răspundem în maximum 30 de zile.",
    },
    {
        name: "ANPC",
        detail: "Autoritatea Națională pentru Protecția Consumatorilor",
        action: "anpc.ro",
        href: "https://anpc.ro",
        note: "Poți depune o reclamație online dacă nu ești mulțumit de răspunsul nostru.",
    },
    {
        name: "SAL",
        detail: "Soluționarea Alternativă a Litigiilor (prin ANPC)",
        action: "anpc.ro/ce-este-sal",
        href: "https://anpc.ro/ce-este-sal/",
        note: "Procedură gratuită, fără instanță.",
    },
    {
        name: "SOL",
        detail: "Platforma europeană de soluționare online a litigiilor",
        action: "ec.europa.eu/consumers/odr",
        href: "https://ec.europa.eu/consumers/odr",
        note: "Pentru cumpărături online din Uniunea Europeană.",
    },
];

export default function AnpcPage() {
    return (
        <main className="mx-auto max-w-2xl px-4 pb-24 pt-8">
            <h1 className="text-2xl font-black">Protecția consumatorului</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-neutral-700 dark:text-neutral-300">
                Ai drepturi garantate de lege atunci când cumperi online, iar noi nu le putem
                limita prin niciun termen contractual. Mai jos, ce poți face dacă ceva nu merge bine.
            </p>

            <h2 className="mt-8 text-lg font-bold">Unde te poți adresa</h2>
            <div className="mt-3 space-y-3">
                {CHANNELS.map((c) => (
                    <a
                        key={c.name}
                        href={c.href}
                        target={c.href.startsWith("http") ? "_blank" : undefined}
                        rel="noreferrer"
                        className="block rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900"
                    >
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="font-bold">{c.name}</span>
                            <span className="text-xs font-semibold text-sky-600">{c.action}</span>
                        </div>
                        <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">{c.detail}</p>
                        <p className="mt-1 text-xs text-neutral-500">{c.note}</p>
                    </a>
                ))}
            </div>

            <h2 className="mt-8 text-lg font-bold">Drepturile tale principale</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] text-neutral-700 dark:text-neutral-300">
                <li>
                    <strong>Retragere în 14 zile</strong> — pentru produse cumpărate online, fără să
                    motivezi. Există excepții legale (mâncare, produse personalizate, cazări cu dată
                    determinată) — le găsești în{" "}
                    <Link href="/terms#retragere" className="underline">Termeni, secțiunea 5</Link>.
                </li>
                <li>
                    <strong>Garanție legală de conformitate 2 ani</strong> — pentru produse
                    neconforme ai dreptul la reparare, înlocuire sau restituirea banilor.
                </li>
                <li>
                    <strong>Preț final afișat</strong> — prețul pe care îl vezi include TVA și nu
                    poate crește la finalul comenzii.
                </li>
                <li>
                    <strong>Informare corectă</strong> — trebuie să știi cine e vânzătorul real. Pe
                    Swypik îți spunem la fiecare serviciu dacă suntem intermediari sau vânzător.
                </li>
            </ul>

            <div className="mt-8 rounded-xl bg-neutral-50 p-4 text-sm dark:bg-neutral-900">
                <p className="font-semibold">Operatorul platformei</p>
                <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                    Swypik Technology · {SUPPORT_EMAIL}
                </p>
                <p className="mt-2 flex flex-wrap gap-3 text-xs">
                    <Link href="/terms" className="underline">Termeni și Condiții</Link>
                    <Link href="/privacy" className="underline">Politica de confidențialitate</Link>
                    <Link href="/legal/cookies" className="underline">Cookie-uri</Link>
                </p>
            </div>
        </main>
    );
}
