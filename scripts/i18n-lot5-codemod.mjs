// One-off codemod: replace hardcoded RO strings in app/admin/** with t() calls.
import fs from "node:fs";

const FILES = [
  {
    f: "app/admin/pricing/page.tsx", ns: "adminPricing",
    rep: [
      ['<th className="p-2">Oraș</th>', '<th className="p-2">{t("thCity")}</th>'],
      ['<th className="p-2">Clasă</th>', '<th className="p-2">{t("thClass")}</th>'],
      ['<th className="p-2">Bază</th>', '<th className="p-2">{t("thBase")}</th>'],
      ['<th className="p-2">Acțiuni</th>', '<th className="p-2">{t("thActions")}</th>'],
      ['<th className="p-2">Zonă</th>', '<th className="p-2">{t("thZone")}</th>'],
      ['<th className="p-2">Început</th>', '<th className="p-2">{t("thStart")}</th>'],
      ['<th className="p-2">Sfârșit</th>', '<th className="p-2">{t("thEnd")}</th>'],
      ['<th className="p-2">Sursă</th>', '<th className="p-2">{t("thSource")}</th>'],
    ],
  },
  {
    f: "app/admin/pricing/PricingActions.tsx", ns: "adminPricing",
    rep: [
      ['<label className="mb-1">Zonă</label>', '<label className="mb-1">{t("zoneLabel")}</label>'],
      ['<label className="mb-1">Durată (min)</label>', '<label className="mb-1">{t("durationMin")}</label>'],
    ],
  },
  {
    f: "app/admin/orders/[id]/page.tsx", ns: "adminOrders",
    rep: [
      ['Comanda nu a fost găsită.', '{t("notFound")}'],
      ['Sumar plată', '{t("paymentSummary")}'],
      ['<span>Total plătit</span>', '<span>{t("totalPaid")}</span>'],
      ['🚚 Cod de urmărire', '{t("trackingCode")}'],
      ['Adresă de livrare', '{t("deliveryAddress")}'],
      ['Nu a fost furnizată nicio adresă de livrare.', '{t("noDeliveryAddress")}'],
      ['Adaugă cod AWB', '{t("addAwbTitle")}'],
      ['Introdu codul de urmărire primit de la curier sau furnizor.', '{t("addAwbDesc")}'],
    ],
  },
  {
    f: "app/admin/creators/page.tsx", ns: "adminCreators",
    rep: [
      ['placeholder="Caută username sau nume..."', 'placeholder={t("searchPlaceholder")}'],
      ['>Caută</button>', '>{t("searchBtn")}</button>'],
      ['>Urmăritori</th>', '>{t("thFollowers")}</th>'],
      ['>Vânzări (#)</th>', '>{t("thSalesCount")}</th>'],
      ['>Vânzări (total)</th>', '>{t("thSalesTotal")}</th>'],
      ['>Acțiuni</th>', '>{t("thActions")}</th>'],
      ['>Niciun creator găsit.</td>', '>{t("noCreators")}</td>'],
    ],
  },
  {
    f: "app/admin/commissions/page.tsx", ns: "adminCommissions",
    rep: [
      ['label="În așteptare"', 'label={t("pendingLabel")}'],
      ['label="Plătite"', 'label={t("paidLabel")}'],
      ['>Platformă</th>', '>{t("thPlatform")}</th>'],
      ['>Comandă</th>', '>{t("thOrder")}</th>'],
      ['>Plătit</th>', '>{t("thPaid")}</th>'],
    ],
  },
  {
    f: "app/admin/hosts/page.tsx", ns: "adminHosts",
    rep: [
      ['>Gazdă: </dt>', '>{t("host")}</dt>'],
      ['>Formă: </dt>', '>{t("form")}</dt>'],
      ['>Firmă: </dt>', '>{t("company")}</dt>'],
      ['title="afișat mascat — integral doar la raportare fiscală"', 'title={t("cnpMaskedTitle")}'],
      ['<strong>Notă:</strong>', '<strong>{t("noteLabel")}</strong>'],
    ],
  },
  {
    f: "app/admin/hosts/HostActions.tsx", ns: "adminHosts",
    rep: [
      ['placeholder="ex: lipsește extrasul CF; certificatul de clasificare e expirat..."', 'placeholder={t("needsInfoPlaceholder")}'],
    ],
  },
  {
    f: "app/admin/marketplace/import/page.tsx", ns: "adminImport",
    rep: [
      ['>Coloane lipsă</p>', '>{t("missingColumns")}</p>'],
      ['>Se importă produsele…</p>', '>{t("importing")}</p>'],
      ['>Total rânduri</p>', '>{t("totalRows")}</p>'],
      ['>Rând</th>', '>{t("thRow")}</th>'],
      ['>Preț</th>', '>{t("thPrice")}</th>'],
    ],
  },
  {
    f: "app/admin/marketplace/MarketplaceFilters.tsx", ns: "adminMarketplace",
    anchor: /export function MarketplaceFilters\([\s\S]*?\)\s*\{/,
    rep: [
      ['placeholder="Caută produse după titlu, slug, brand sau categorie..."', 'placeholder={t("searchPlaceholder")}'],
    ],
  },
  {
    f: "app/admin/courier-payouts/page.tsx", ns: "adminCourierPayouts",
    rep: [
      ['>Se încarcă…</div>', '>{t("loading")}</div>'],
      ['<th className="p-3">Sumă</th>', '<th className="p-3">{t("thAmount")}</th>'],
      ['<th className="p-3">Cerută la</th>', '<th className="p-3">{t("thRequestedAt")}</th>'],
      ['<th className="p-3">Acțiuni</th>', '<th className="p-3">{t("thActions")}</th>'],
    ],
  },
  {
    f: "app/admin/AdminShell.tsx", ns: "adminShell",
    anchor: /function SidebarContent\(\{/,
    extraAnchor: /export default function AdminShell\(\{ children \}: \{ children: ReactNode \}\) \{/,
    rep: [
      ['title="În curând"', 'title={t("comingSoon")}'],
      ['aria-label="Închide meniul"', 'aria-label={t("closeMenu")}'],
      ['aria-label="Închide"', 'aria-label={t("close")}'],
    ],
  },
  {
    f: "app/admin/aplicatii/page.tsx", ns: "adminApplications",
    rep: [
      ['>Aplicații parteneri</h1>', '>{t("partnersTitle")}</h1>'],
      ['>Oraș</th>', '>{t("thCity")}</th>'],
      ['>Primită</th>', '>{t("thReceived")}</th>'],
    ],
  },
  {
    f: "app/admin/applications/page.tsx", ns: "adminApplications",
    rep: [
      ['>Aplicații creator</h1>', '>{t("creatorTitle")}</h1>'],
      ['>Cereri de la utilizatori care vor să devină creatori.</p>', '>{t("creatorSubtitle")}</p>'],
      ['>Notă review</dt>', '>{t("reviewNote")}</dt>'],
    ],
  },
  {
    f: "app/admin/applications/ApplicationActions.tsx", ns: "adminApplications",
    rep: [
      ['placeholder="Notă pentru jurnal sau motiv de respingere..."', 'placeholder={t("journalNotePlaceholder")}'],
    ],
  },
  {
    f: "app/admin/disputes/page.tsx", ns: "adminDisputes",
    rep: [
      ['>Total comandă:</span>', '>{t("orderTotal")}</span>'],
      ['>Evidence trimisă:</div>', '>{t("evidenceSent")}</div>'],
    ],
  },
  {
    f: "app/admin/disputes/DisputeEvidenceForm.tsx", ns: "adminDisputes",
    rep: [
      ['>Răspunde la dispute</div>', '>{t("respondTitle")}</div>'],
      ['>Fișiere (PDF / PNG / JPG, max 5MB)</div>', '>{t("filesLabel")}</div>'],
      ['>Se urcă la Stripe…</div>', '>{t("uploadingStripe")}</div>'],
    ],
  },
  {
    f: "app/admin/moderation/page.tsx", ns: "adminModeration",
    rep: [
      ['>Moderare conținut</h1>', '>{t("pageTitle")}</h1>'],
      ['<option value="triaged">În analiză</option>', '<option value="triaged">{t("statusTriaged")}</option>'],
    ],
  },
  {
    f: "app/admin/moderation/[id]/page.tsx", ns: "adminModeration",
    rep: [
      ['>Notă:</dt>', '>{t("noteLabel")}</dt>'],
    ],
  },
  {
    f: "app/admin/moderation/[id]/ModerationActions.tsx", ns: "adminModeration",
    rep: [
      ['>Acțiuni</h2>', '>{t("actionsTitle")}</h2>'],
      ['>Motiv intern (opțional)</label>', '>{t("internalReason")}</label>'],
      ['placeholder="Notă pentru jurnal..."', 'placeholder={t("journalPlaceholder")}'],
    ],
  },
  {
    f: "app/admin/payouts/page.tsx", ns: "adminPayouts",
    rep: [
      ['label="În așteptare"', 'label={t("pendingLabel")}'],
      ['label="Eșuate"', 'label={t("failedLabel")}'],
      ['>Sumă</th>', '>{t("thAmount")}</th>'],
    ],
  },
  {
    f: "app/admin/strikes/page.tsx", ns: "adminStrikes",
    rep: [
      ['>Când</th>', '>{t("thWhen")}</th>'],
      ['>Expiră</th>', '>{t("thExpires")}</th>'],
      ['>Acțiuni</th>', '>{t("thActions")}</th>'],
    ],
  },
  {
    f: "app/admin/refunds/page.tsx", ns: "adminRefunds",
    rep: [
      ['>Comandă</th>', '>{t("thOrder")}</th>'],
      ['>Sumă</th>', '>{t("thAmount")}</th>'],
    ],
  },
  {
    f: "app/admin/returns/page.tsx", ns: "adminReturns",
    rep: [
      ['>Comandă</th>', '>{t("thOrder")}</th>'],
      ['>Acțiuni</th>', '>{t("thActions")}</th>'],
    ],
  },
  {
    f: "app/admin/reviews/ReviewActions.tsx", ns: "adminReviews",
    rep: [
      ['aria-label="Reactivează"', 'aria-label={t("reactivate")}'],
      ['aria-label="Șterge"', 'aria-label={t("delete")}'],
    ],
  },
  {
    f: "app/admin/users/page.tsx", ns: "adminUsers",
    rep: [
      ['placeholder="Caută după username, email sau nume..."', 'placeholder={t("searchPlaceholder")}'],
      ['>Acțiuni</th>', '>{t("thActions")}</th>'],
    ],
  },
  {
    f: "app/admin/videos/page.tsx", ns: "adminVideos",
    rep: [
      ['>Durată</th>', '>{t("thDuration")}</th>'],
      ['>Acțiuni</th>', '>{t("thActions")}</th>'],
    ],
  },
  {
    f: "app/admin/cron/page.tsx", ns: "adminCron",
    rep: [
      ['>Acțiuni</th>', '>{t("thActions")}</th>'],
    ],
  },
  {
    f: "app/admin/fleet/FleetActions.tsx", ns: "adminFleet",
    anchor: /export default function FleetActions\(\{/,
    rep: [
      ['title="Șterge definitiv"', 'title={t("deleteForever")}'],
    ],
  },
  {
    f: "app/admin/health/HealthRefresh.tsx", ns: "adminHealth",
    anchor: /export default function HealthRefresh\(\{/,
    rep: [
      ['>Latență</dt>', '>{t("latency")}</dt>'],
    ],
  },
  {
    f: "app/admin/risk/page.tsx", ns: "adminRisk",
    rep: [
      ['>Risc fraudă comenzi</h1>', '>{t("title")}</h1>'],
    ],
  },
  {
    f: "app/admin/risk/TimeSeriesChart.tsx", ns: "adminRisk",
    anchor: /export function TimeSeriesChart\(\{ data \}: \{ data: TimeSeries30d \}\) \{/,
    rep: [
      ['aria-label="Trend ultimele 30 zile pentru comenzi flagged, decizii approve/block și auto-blocks"', 'aria-label={t("chartAria")}'],
    ],
  },
  {
    f: "app/admin/sellers/page.tsx", ns: "adminSellers",
    rep: [
      ['>Acțiuni</th>', '>{t("thActions")}</th>'],
    ],
  },
];

let fail = 0;
for (const cfg of FILES) {
  let s = fs.readFileSync(cfg.f, "utf8");
  const isClient = /^\s*["']use client["']/m.test(s);
  // replacements (replaceAll)
  for (const [oldS, newS] of cfg.rep) {
    if (!s.includes(oldS)) { console.log(`MISS ${cfg.f} :: ${oldS.slice(0, 60)}`); fail++; continue; }
    s = s.split(oldS).join(newS);
  }
  // import
  if (isClient) {
    if (!s.includes('from "next-intl"')) {
      s = s.replace(/(^import [^\n]*\n)/m, `$1import { useTranslations } from "next-intl";\n`);
    }
  } else {
    if (!s.includes('from "next-intl/server"')) {
      s = s.replace(/(^import [^\n]*\n)/m, `$1import { getTranslations } from "next-intl/server";\n`);
    }
  }
  // t declaration
  const decl = isClient
    ? `    const t = useTranslations("${cfg.ns}");\n`
    : `    const t = await getTranslations("${cfg.ns}");\n`;
  const anchors = [cfg.anchor, cfg.extraAnchor].filter(Boolean);
  if (anchors.length === 0) {
    anchors.push(isClient ? /export default function \w+\([^)]*\)(?::[^{]+)? \{/ : /export default async function \w+\([^)]*\)(?::[^{]+)? \{/);
  }
  for (const a of anchors) {
    const m = s.match(a);
    if (!m) { console.log(`NO-ANCHOR ${cfg.f} :: ${a}`); fail++; continue; }
    // find end of the matched opening (position after match)
    const idx = s.indexOf(m[0]) + m[0].length;
    // insert after the end of that line
    const nl = s.indexOf("\n", idx);
    if (!s.slice(nl + 1, nl + 200).includes(`useTranslations("${cfg.ns}")`) && !s.slice(nl + 1, nl + 200).includes(`getTranslations("${cfg.ns}")`)) {
      s = s.slice(0, nl + 1) + decl + s.slice(nl + 1);
    }
  }
  fs.writeFileSync(cfg.f, s, "utf8");
}
console.log(fail === 0 ? "ALL OK" : `FAILURES: ${fail}`);
