import type { Metadata } from "next";
import Link from "next/link";
import { dbQuery } from "@/lib/db";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://swypik.com";
const HARD_CAP = 21_000_000;

type Props = { params: Promise<{ locale: string }> };

// One T per locale, with allocation label translations.
const T = {
  ro: {
    title: "Genesis $SWYP — Transparență Tokenomics | Swypik",
    desc: "Cele 21.000.000 $SWYP au fost mintate la genesis în 7 adrese on-chain auditabile. Vezi alocarea în timp real, fără presale public.",
    h1: "Genesis $SWYP",
    sub: "21.000.000 $SWYP, hard cap definitiv. Toate adresele de alocare sunt publice și verificabile.",
    crumbHome: "Acasă",
    crumbToken: "$SWYP",
    crumbGenesis: "Genesis",
    sealedAt: "Sigilat la genesis",
    chainId: "Chain ID",
    hardCap: "Hard cap",
    allocation: "Alocare la genesis",
    colLabel: "Categorie",
    colPct: "Procent",
    colAmount: "SWYP",
    colAddress: "Adresă on-chain",
    whyTitle: "De ce contează această pagină",
    why1Title: "Zero presale public",
    why1Body: "Niciun $SWYP nu a fost vândut public la lansare. Categoria „Pre-sale Reserve” (2%) este blocată până la activarea programatică, nu colectează bani de la investitori.",
    why2Title: "Adrese auditabile",
    why2Body: "Fiecare alocare are o adresă publică, derivată determinist. Oricine poate verifica balanța live prin /api/swypik-token/genesis sau Swypik Explorer.",
    why3Title: "Vesting team cu cliff",
    why3Body: "Cei 5% Team Vesting sunt eliberați 4 ani cu cliff de 6 luni — protocolul nu se poate dump-ui de team în prima fază.",
    why4Title: "Mining = singurul mod de distribuție",
    why4Body: "75% din supply (Mining Rewards Pool) intră în circulație doar prin proof-of-work „tap to mine”. Fără pre-mine ascuns, fără airdrop arbitrar.",
    learnMore: "Despre $SWYP",
  },
  en: {
    title: "Genesis $SWYP — Tokenomics Transparency | Swypik",
    desc: "All 21,000,000 $SWYP were minted at genesis into 7 auditable on-chain addresses. See the live allocation — no public presale.",
    h1: "$SWYP Genesis",
    sub: "21,000,000 $SWYP, hard-capped. Every allocation address is public and verifiable.",
    crumbHome: "Home",
    crumbToken: "$SWYP",
    crumbGenesis: "Genesis",
    sealedAt: "Sealed at genesis",
    chainId: "Chain ID",
    hardCap: "Hard cap",
    allocation: "Genesis allocation",
    colLabel: "Bucket",
    colPct: "Percent",
    colAmount: "SWYP",
    colAddress: "On-chain address",
    whyTitle: "Why this page matters",
    why1Title: "Zero public presale",
    why1Body: "No $SWYP was sold publicly at launch. The Pre-sale Reserve (2%) is locked and unlocks only via protocol vote — it does not raise money from retail investors.",
    why2Title: "Auditable addresses",
    why2Body: "Every allocation has a public, deterministically derived address. Anyone can verify the live balance via /api/swypik-token/genesis or the Swypik Explorer.",
    why3Title: "Team vesting with cliff",
    why3Body: "The 5% Team Vesting unlocks over 4 years with a 6-month cliff — the team cannot dump on the protocol in its early phase.",
    why4Title: "Mining is the only distribution",
    why4Body: "75% of supply (Mining Rewards Pool) enters circulation exclusively through 'tap-to-mine' proof-of-work. No hidden pre-mine, no arbitrary airdrop.",
    learnMore: "About $SWYP",
  },
  de: {
    title: "Genesis $SWYP — Tokenomics-Transparenz | Swypik",
    desc: "Alle 21.000.000 $SWYP wurden bei Genesis in 7 prüfbaren On-Chain-Adressen geprägt. Sieh dir die aktuelle Verteilung an — kein öffentlicher Presale.",
    h1: "$SWYP Genesis",
    sub: "21.000.000 $SWYP, hartes Cap. Jede Zuteilungsadresse ist öffentlich und überprüfbar.",
    crumbHome: "Start",
    crumbToken: "$SWYP",
    crumbGenesis: "Genesis",
    sealedAt: "Bei Genesis versiegelt",
    chainId: "Chain-ID",
    hardCap: "Hard Cap",
    allocation: "Genesis-Zuteilung",
    colLabel: "Kategorie",
    colPct: "Anteil",
    colAmount: "SWYP",
    colAddress: "On-Chain-Adresse",
    whyTitle: "Warum diese Seite zählt",
    why1Title: "Kein öffentlicher Presale",
    why1Body: "Beim Start wurde kein $SWYP öffentlich verkauft. Die Presale-Reserve (2%) bleibt gesperrt und wird nur per Protokoll-Vote freigegeben — kein Geld von Kleinanlegern.",
    why2Title: "Prüfbare Adressen",
    why2Body: "Jede Zuteilung hat eine öffentliche, deterministisch abgeleitete Adresse. Jeder kann das Live-Guthaben über /api/swypik-token/genesis oder den Swypik Explorer prüfen.",
    why3Title: "Team-Vesting mit Cliff",
    why3Body: "Die 5% Team-Vesting werden über 4 Jahre mit 6-Monats-Cliff freigegeben — das Team kann das Protokoll in der Anfangsphase nicht dumpen.",
    why4Title: "Mining = einziger Verteilungsweg",
    why4Body: "75% des Supply (Mining-Rewards-Pool) gelangen ausschließlich per Proof-of-Work „Tap-to-Mine“ in Umlauf. Kein verstecktes Pre-Mine, kein willkürlicher Airdrop.",
    learnMore: "Über $SWYP",
  },
  es: {
    title: "Genesis $SWYP — Transparencia de Tokenomics | Swypik",
    desc: "Los 21.000.000 $SWYP fueron acuñados en el génesis en 7 direcciones on-chain auditables. Mira la asignación en vivo — sin presale público.",
    h1: "Génesis de $SWYP",
    sub: "21.000.000 $SWYP, cap definitivo. Toda dirección de asignación es pública y verificable.",
    crumbHome: "Inicio",
    crumbToken: "$SWYP",
    crumbGenesis: "Génesis",
    sealedAt: "Sellado en el génesis",
    chainId: "ID de cadena",
    hardCap: "Hard cap",
    allocation: "Asignación de génesis",
    colLabel: "Categoría",
    colPct: "Porcentaje",
    colAmount: "SWYP",
    colAddress: "Dirección on-chain",
    whyTitle: "Por qué importa esta página",
    why1Title: "Cero presale público",
    why1Body: "Ningún $SWYP se vendió públicamente al lanzar. La Reserva de Presale (2%) está bloqueada y solo se desbloquea por votación del protocolo — no recauda dinero de inversores.",
    why2Title: "Direcciones auditables",
    why2Body: "Cada asignación tiene una dirección pública, derivada determinísticamente. Cualquiera puede verificar el saldo en vivo vía /api/swypik-token/genesis o el Explorador Swypik.",
    why3Title: "Vesting del equipo con cliff",
    why3Body: "El 5% de Team Vesting se libera durante 4 años con cliff de 6 meses — el equipo no puede vaciar el protocolo en su fase inicial.",
    why4Title: "El minado es la única distribución",
    why4Body: "El 75% del suministro (Mining Rewards Pool) entra en circulación solo vía proof-of-work „tap-to-mine“. Sin pre-mine oculto ni airdrop arbitrario.",
    learnMore: "Sobre $SWYP",
  },
  fr: {
    title: "Genesis $SWYP — Transparence Tokenomics | Swypik",
    desc: "Les 21 000 000 $SWYP ont été émis au genesis dans 7 adresses on-chain auditables. Voir la répartition en direct — pas de presale public.",
    h1: "Genesis $SWYP",
    sub: "21 000 000 $SWYP, hard cap définitif. Toute adresse d'allocation est publique et vérifiable.",
    crumbHome: "Accueil",
    crumbToken: "$SWYP",
    crumbGenesis: "Genesis",
    sealedAt: "Scellé au genesis",
    chainId: "Chain ID",
    hardCap: "Hard cap",
    allocation: "Allocation genesis",
    colLabel: "Catégorie",
    colPct: "Pourcentage",
    colAmount: "SWYP",
    colAddress: "Adresse on-chain",
    whyTitle: "Pourquoi cette page compte",
    why1Title: "Zéro presale public",
    why1Body: "Aucun $SWYP n'a été vendu publiquement au lancement. La Réserve de Presale (2%) est verrouillée et ne s'ouvre que par vote du protocole — pas de levée auprès d'investisseurs.",
    why2Title: "Adresses auditables",
    why2Body: "Chaque allocation a une adresse publique, dérivée de façon déterministe. N'importe qui peut vérifier le solde en direct via /api/swypik-token/genesis ou Swypik Explorer.",
    why3Title: "Vesting d'équipe avec cliff",
    why3Body: "Les 5% Team Vesting se débloquent sur 4 ans avec cliff de 6 mois — l'équipe ne peut pas dumper sur le protocole en début de vie.",
    why4Title: "Le minage est la seule distribution",
    why4Body: "75% du supply (Mining Rewards Pool) entre en circulation uniquement via proof-of-work « tap-to-mine ». Pas de pre-mine caché, pas d'airdrop arbitraire.",
    learnMore: "À propos de $SWYP",
  },
  it: {
    title: "Genesis $SWYP — Trasparenza Tokenomics | Swypik",
    desc: "I 21.000.000 $SWYP sono stati coniati al genesis in 7 indirizzi on-chain verificabili. Vedi l'allocazione live — nessun presale pubblico.",
    h1: "Genesis $SWYP",
    sub: "21.000.000 $SWYP, hard cap definitivo. Ogni indirizzo di allocazione è pubblico e verificabile.",
    crumbHome: "Home",
    crumbToken: "$SWYP",
    crumbGenesis: "Genesis",
    sealedAt: "Sigillato al genesis",
    chainId: "Chain ID",
    hardCap: "Hard cap",
    allocation: "Allocazione genesis",
    colLabel: "Categoria",
    colPct: "Percentuale",
    colAmount: "SWYP",
    colAddress: "Indirizzo on-chain",
    whyTitle: "Perché questa pagina conta",
    why1Title: "Zero presale pubblico",
    why1Body: "Nessun $SWYP è stato venduto pubblicamente al lancio. La Riserva Presale (2%) è bloccata e si sblocca solo via voto di protocollo — non raccoglie soldi da investitori retail.",
    why2Title: "Indirizzi verificabili",
    why2Body: "Ogni allocazione ha un indirizzo pubblico derivato in modo deterministico. Chiunque può verificare il saldo live via /api/swypik-token/genesis o Swypik Explorer.",
    why3Title: "Vesting team con cliff",
    why3Body: "Il 5% Team Vesting si sblocca in 4 anni con cliff di 6 mesi — il team non può dumpare sul protocollo nella fase iniziale.",
    why4Title: "Il mining è l'unica distribuzione",
    why4Body: "Il 75% del supply (Mining Rewards Pool) entra in circolazione solo via proof-of-work „tap-to-mine“. Niente pre-mine nascosto né airdrop arbitrari.",
    learnMore: "Su $SWYP",
  },
  pt: {
    title: "Genesis $SWYP — Transparência de Tokenomics | Swypik",
    desc: "Os 21.000.000 $SWYP foram cunhados no genesis em 7 endereços on-chain auditáveis. Vê a alocação ao vivo — sem presale público.",
    h1: "Genesis $SWYP",
    sub: "21.000.000 $SWYP, hard cap definitivo. Todo endereço de alocação é público e verificável.",
    crumbHome: "Início",
    crumbToken: "$SWYP",
    crumbGenesis: "Genesis",
    sealedAt: "Selado no genesis",
    chainId: "Chain ID",
    hardCap: "Hard cap",
    allocation: "Alocação genesis",
    colLabel: "Categoria",
    colPct: "Percentagem",
    colAmount: "SWYP",
    colAddress: "Endereço on-chain",
    whyTitle: "Por que esta página importa",
    why1Title: "Zero presale público",
    why1Body: "Nenhum $SWYP foi vendido publicamente no lançamento. A Reserva Presale (2%) está bloqueada e só desbloqueia por voto do protocolo — não capta dinheiro de investidores.",
    why2Title: "Endereços auditáveis",
    why2Body: "Cada alocação tem um endereço público derivado deterministicamente. Qualquer pessoa pode verificar o saldo ao vivo via /api/swypik-token/genesis ou Swypik Explorer.",
    why3Title: "Vesting do team com cliff",
    why3Body: "Os 5% Team Vesting libertam-se em 4 anos com cliff de 6 meses — o team não pode despejar no protocolo na fase inicial.",
    why4Title: "Mineração é a única distribuição",
    why4Body: "75% do supply (Mining Rewards Pool) entra em circulação apenas via proof-of-work „tap-to-mine“. Sem pre-mine oculto, sem airdrop arbitrário.",
    learnMore: "Sobre $SWYP",
  },
} as const;

type Locale = keyof typeof T;
const SUPPORTED: Locale[] = ["ro", "en", "de", "es", "fr", "it", "pt"];
function pickT(l: string): (typeof T)[Locale] {
  return (T as Record<string, (typeof T)[Locale]>)[l] ?? T.ro;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = pickT(locale);
  const lp = locale && locale !== "ro" ? `/${locale}` : "";
  return {
    title: t.title,
    description: t.desc,
    alternates: {
      canonical: `${BASE_URL}${lp}/swyp/genesis`,
      languages: {
        ro: `${BASE_URL}/swyp/genesis`,
        en: `${BASE_URL}/en/swyp/genesis`,
        de: `${BASE_URL}/de/swyp/genesis`,
        es: `${BASE_URL}/es/swyp/genesis`,
        fr: `${BASE_URL}/fr/swyp/genesis`,
        it: `${BASE_URL}/it/swyp/genesis`,
        pt: `${BASE_URL}/pt/swyp/genesis`,
        "x-default": `${BASE_URL}/swyp/genesis`,
      },
    },
    openGraph: {
      title: t.title,
      description: t.desc,
      url: `${BASE_URL}${lp}/swyp/genesis`,
      type: "website",
      images: [{ url: `${BASE_URL}/og-preview.webp`, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title: t.title, description: t.desc },
  };
}

type GenesisRow = { label: string; address: string; balance: string };

async function loadGenesis(): Promise<GenesisRow[]> {
  const sql = `
    SELECT a.label, a.address, b.balance::text AS balance
    FROM swypik_token_balances b
    JOIN swypik_addresses a ON a.address = b.address
    WHERE a.label <> 'Primary'
    ORDER BY b.balance::numeric DESC, a.label ASC
  `;
  try {
    const { rows } = await dbQuery(sql);
    return rows as GenesisRow[];
  } catch {
    return [];
  }
}

function fmtSwyp(s: string, locale: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString(locale === "en" ? "en-US" : locale === "ro" ? "ro-RO" : locale, {
    maximumFractionDigits: 2,
  });
}

function shortAddr(a: string): string {
  if (a.length <= 16) return a;
  return `${a.slice(0, 10)}…${a.slice(-6)}`;
}

export default async function SwypGenesisPage({ params }: Props) {
  const { locale } = await params;
  const t = pickT(locale);
  const lp = locale && locale !== "ro" ? `/${locale}` : "";
  const genesis = await loadGenesis();

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t.crumbHome, item: `${BASE_URL}${lp}/` },
      { "@type": "ListItem", position: 2, name: t.crumbToken, item: `${BASE_URL}${lp}/earn` },
      { "@type": "ListItem", position: 3, name: t.crumbGenesis, item: `${BASE_URL}${lp}/swyp/genesis` },
    ],
  };

  const webPageLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: t.title,
    description: t.desc,
    url: `${BASE_URL}${lp}/swyp/genesis`,
    inLanguage: locale,
    isPartOf: { "@type": "WebSite", name: "Swypik", url: BASE_URL },
  };

  return (
    <main className="min-h-screen bg-white text-[#0D0D0D]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageLd) }} />

      {/* Breadcrumb */}
      <nav className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 text-sm text-zinc-500">
        <ol className="flex items-center gap-2">
          <li><Link href={`${lp}/`} className="hover:text-[#0D0D0D]">{t.crumbHome}</Link></li>
          <li>›</li>
          <li><Link href={`${lp}/earn`} className="hover:text-[#0D0D0D]">{t.crumbToken}</Link></li>
          <li>›</li>
          <li className="text-[#0D0D0D] font-semibold">{t.crumbGenesis}</li>
        </ol>
      </nav>

      {/* Hero */}
      <header className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-14">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-violet-100 to-pink-100 text-violet-700 text-xs font-bold mb-4">
          ✦ {t.sealedAt}
        </div>
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight">{t.h1}</h1>
        <p className="mt-4 text-lg sm:text-xl text-zinc-600 max-w-2xl leading-relaxed">{t.sub}</p>

        <div className="mt-8 grid sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-zinc-200 p-5">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">{t.hardCap}</div>
            <div className="text-2xl font-extrabold mt-1">{fmtSwyp(String(HARD_CAP), locale)}</div>
            <div className="text-xs text-zinc-500 mt-1">$SWYP</div>
          </div>
          <div className="rounded-2xl border border-zinc-200 p-5">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">{t.chainId}</div>
            <div className="text-base font-mono font-bold mt-1">swypik-mainnet-1</div>
            <div className="text-xs text-zinc-500 mt-1">PoW · tap-to-mine</div>
          </div>
          <div className="rounded-2xl border border-zinc-200 p-5">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">{t.sealedAt}</div>
            <div className="text-base font-mono font-bold mt-1">2026-06-01</div>
            <div className="text-xs text-zinc-500 mt-1">100% minted</div>
          </div>
        </div>
      </header>

      {/* Allocation table */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <h2 className="text-2xl sm:text-3xl font-black mb-6">{t.allocation}</h2>
        <div className="overflow-x-auto rounded-2xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">{t.colLabel}</th>
                <th className="text-right px-4 py-3 font-semibold">{t.colPct}</th>
                <th className="text-right px-4 py-3 font-semibold">{t.colAmount}</th>
                <th className="text-left px-4 py-3 font-semibold">{t.colAddress}</th>
              </tr>
            </thead>
            <tbody>
              {genesis.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">—</td></tr>
              ) : genesis.map((g) => {
                const pct = ((Number(g.balance) / HARD_CAP) * 100).toFixed(2);
                return (
                  <tr key={g.address} className="border-t border-zinc-100">
                    <td className="px-4 py-3 font-semibold">{g.label}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{pct}%</td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono">{fmtSwyp(g.balance, locale)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600" title={g.address}>{shortAddr(g.address)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Why this matters */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        <h2 className="text-2xl sm:text-3xl font-black mb-6">{t.whyTitle}</h2>
        <div className="grid sm:grid-cols-2 gap-5">
          {[
            { t: t.why1Title, b: t.why1Body },
            { t: t.why2Title, b: t.why2Body },
            { t: t.why3Title, b: t.why3Body },
            { t: t.why4Title, b: t.why4Body },
          ].map((c, i) => (
            <div key={i} className="rounded-2xl border border-zinc-200 p-6">
              <h3 className="font-extrabold text-lg mb-2">{c.t}</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">{c.b}</p>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <Link
            href={`${lp}/earn`}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-[#0D0D0D] text-white font-semibold text-sm hover:bg-zinc-800 transition"
          >
            {t.learnMore} →
          </Link>
        </div>
      </section>
    </main>
  );
}

export function generateStaticParams() {
  return SUPPORTED.map((locale) => ({ locale }));
}
