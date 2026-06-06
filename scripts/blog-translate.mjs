#!/usr/bin/env node
/**
 * Blog Multi-Locale Translator (DE/ES/FR/PT/IT)
 *
 * Generează variante traduse în `blog_article_translations` pentru fiecare
 * articol RO publicat, reutilizând structura din `blog-translate-en.mjs`.
 *
 * Data flow:
 *   1. SELECT articole RO publicate din `blog_articles`
 *   2. Pentru fiecare locale target: pattern-match title + excerpt
 *   3. JOIN product_translations pe locale-ul țintă pentru body MDX
 *   4. INSERT în blog_article_translations cu source='template-<loc>-v1'
 *
 * Usage:
 *   DRY all:     node scripts/blog-translate.mjs
 *   APPLY all:   node scripts/blog-translate.mjs --apply
 *   ONE LOCALE:  node scripts/blog-translate.mjs --apply --locale=de
 *   ONE SLUG:    node scripts/blog-translate.mjs --apply --slug=top-electronice-2026
 *   FORCE:       --force  (overwrite existing translations)
 */
import pg from 'pg';
const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const APPLY = Boolean(args.apply);
const FORCE = Boolean(args.force);
const ONLY_SLUG = args.slug ? String(args.slug) : null;
const ONLY_LOCALE = args.locale ? String(args.locale) : null;

const TARGET_LOCALES = ['de', 'es', 'fr', 'pt', 'it'];
const LOCALES = ONLY_LOCALE ? [ONLY_LOCALE] : TARGET_LOCALES;

// =====================================================================
// Per-locale dictionaries
// =====================================================================
const CATEGORY_MAP = {
  de: {
    'Modă': 'Mode', 'Tehnologie': 'Technik', 'Casă & Birou': 'Haus & Büro',
    'Casă & Grădină': 'Haus & Garten', 'Frumusețe': 'Beauty',
    'Sport & Outdoor': 'Sport & Outdoor', 'Jucării': 'Spielzeug',
    'Bijuterii': 'Schmuck', 'Genți & Bagaje': 'Taschen & Gepäck',
    'Igienă dentară': 'Zahnpflege', 'Pantaloni': 'Hosen',
    'Pantaloni Scurți': 'Shorts', 'Pantaloni scurți': 'Shorts',
    'Încălțăminte': 'Schuhe', 'Calculatoare': 'Computer', 'Genți': 'Taschen',
    'Accesorii frumusețe': 'Beauty-Zubehör', 'Birotică': 'Bürobedarf',
    'Electronice': 'Elektronik', 'Fashion': 'Mode', 'Men': 'Herren',
    'Women': 'Damen', 'Kids': 'Kinder',
    'Încărcătoare & cabluri': 'Ladegeräte & Kabel',
    'Încărcătoare': 'Ladegeräte',
    'Cabluri': 'Kabel',
    'Căști': 'Kopfhörer',
    'Boxe': 'Lautsprecher',
    'Tricouri': 'T-Shirts',
    'Bluze': 'Blusen',
    'Pantofi': 'Schuhe',
    'Sandale': 'Sandalen',
    'Adidași': 'Sneaker',
    'Ceasuri': 'Uhren',
    'Ochelari': 'Brillen',
    'Parfumuri': 'Parfüms',
    'Cosmetice': 'Kosmetik',
    'Jocuri': 'Spiele',
    'Cărți': 'Bücher',
    'Lenjerie': 'Unterwäsche',
    'Genți damă': 'Damentaschen',
    'Genți barbati': 'Herrentaschen',
    'Portofele': 'Geldbörsen',
  },
  es: {
    'Modă': 'Moda', 'Tehnologie': 'Tecnología', 'Casă & Birou': 'Casa y Oficina',
    'Casă & Grădină': 'Casa y Jardín', 'Frumusețe': 'Belleza',
    'Sport & Outdoor': 'Deporte y Aire Libre', 'Jucării': 'Juguetes',
    'Bijuterii': 'Joyería', 'Genți & Bagaje': 'Bolsos y Equipaje',
    'Igienă dentară': 'Higiene Dental', 'Pantaloni': 'Pantalones',
    'Pantaloni Scurți': 'Pantalones Cortos', 'Pantaloni scurți': 'Pantalones cortos',
    'Încălțăminte': 'Calzado', 'Calculatoare': 'Ordenadores', 'Genți': 'Bolsos',
    'Accesorii frumusețe': 'Accesorios de Belleza', 'Birotică': 'Material de Oficina',
    'Electronice': 'Electrónica', 'Fashion': 'Moda', 'Men': 'Hombre',
    'Women': 'Mujer', 'Kids': 'Niños',
    'Încărcătoare & cabluri': 'Cargadores y Cables',
    'Încărcătoare': 'Cargadores',
    'Cabluri': 'Cables',
    'Căști': 'Auriculares',
    'Boxe': 'Altavoces',
    'Tricouri': 'Camisetas',
    'Bluze': 'Blusas',
    'Pantofi': 'Zapatos',
    'Sandale': 'Sandalias',
    'Adidași': 'Zapatillas',
    'Ceasuri': 'Relojes',
    'Ochelari': 'Gafas',
    'Parfumuri': 'Perfumes',
    'Cosmetice': 'Cosméticos',
    'Jocuri': 'Juegos',
    'Cărți': 'Libros',
    'Lenjerie': 'Ropa Interior',
    'Genți damă': 'Bolsos de Mujer',
    'Genți barbati': 'Bolsos de Hombre',
    'Portofele': 'Carteras',
  },
  fr: {
    'Modă': 'Mode', 'Tehnologie': 'Tech', 'Casă & Birou': 'Maison & Bureau',
    'Casă & Grădină': 'Maison & Jardin', 'Frumusețe': 'Beauté',
    'Sport & Outdoor': 'Sport & Plein Air', 'Jucării': 'Jouets',
    'Bijuterii': 'Bijoux', 'Genți & Bagaje': 'Sacs & Bagages',
    'Igienă dentară': 'Hygiène Dentaire', 'Pantaloni': 'Pantalons',
    'Pantaloni Scurți': 'Shorts', 'Pantaloni scurți': 'shorts',
    'Încălțăminte': 'Chaussures', 'Calculatoare': 'Ordinateurs', 'Genți': 'Sacs',
    'Accesorii frumusețe': 'Accessoires Beauté', 'Birotică': 'Fournitures de Bureau',
    'Electronice': 'Électronique', 'Fashion': 'Mode', 'Men': 'Homme',
    'Women': 'Femme', 'Kids': 'Enfant',
    'Încărcătoare & cabluri': 'Chargeurs & Câbles',
    'Încărcătoare': 'Chargeurs',
    'Cabluri': 'Câbles',
    'Căști': 'Écouteurs',
    'Boxe': 'Enceintes',
    'Tricouri': 'T-shirts',
    'Bluze': 'Chemisiers',
    'Pantofi': 'Chaussures',
    'Sandale': 'Sandales',
    'Adidași': 'Baskets',
    'Ceasuri': 'Montres',
    'Ochelari': 'Lunettes',
    'Parfumuri': 'Parfums',
    'Cosmetice': 'Cosmétiques',
    'Jocuri': 'Jeux',
    'Cărți': 'Livres',
    'Lenjerie': 'Sous-vêtements',
    'Genți damă': 'Sacs Femme',
    'Genți barbati': 'Sacs Homme',
    'Portofele': 'Portefeuilles',
  },
  pt: {
    'Modă': 'Moda', 'Tehnologie': 'Tecnologia', 'Casă & Birou': 'Casa e Escritório',
    'Casă & Grădină': 'Casa e Jardim', 'Frumusețe': 'Beleza',
    'Sport & Outdoor': 'Desporto e Ar Livre', 'Jucării': 'Brinquedos',
    'Bijuterii': 'Joalharia', 'Genți & Bagaje': 'Malas e Bagagens',
    'Igienă dentară': 'Higiene Dentária', 'Pantaloni': 'Calças',
    'Pantaloni Scurți': 'Calções', 'Pantaloni scurți': 'calções',
    'Încălțăminte': 'Calçado', 'Calculatoare': 'Computadores', 'Genți': 'Malas',
    'Accesorii frumusețe': 'Acessórios de Beleza', 'Birotică': 'Material de Escritório',
    'Electronice': 'Eletrónica', 'Fashion': 'Moda', 'Men': 'Homem',
    'Women': 'Mulher', 'Kids': 'Criança',
    'Încărcătoare & cabluri': 'Carregadores e Cabos',
    'Încărcătoare': 'Carregadores',
    'Cabluri': 'Cabos',
    'Căști': 'Auscultadores',
    'Boxe': 'Colunas',
    'Tricouri': 'T-shirts',
    'Bluze': 'Blusas',
    'Pantofi': 'Sapatos',
    'Sandale': 'Sandálias',
    'Adidași': 'Ténis',
    'Ceasuri': 'Relógios',
    'Ochelari': 'Óculos',
    'Parfumuri': 'Perfumes',
    'Cosmetice': 'Cosméticos',
    'Jocuri': 'Jogos',
    'Cărți': 'Livros',
    'Lenjerie': 'Roupa Interior',
    'Genți damă': 'Malas de Senhora',
    'Genți barbati': 'Malas de Homem',
    'Portofele': 'Carteiras',
  },
  it: {
    'Modă': 'Moda', 'Tehnologie': 'Tecnologia', 'Casă & Birou': 'Casa e Ufficio',
    'Casă & Grădină': 'Casa e Giardino', 'Frumusețe': 'Bellezza',
    'Sport & Outdoor': 'Sport e Outdoor', 'Jucării': 'Giocattoli',
    'Bijuterii': 'Gioielli', 'Genți & Bagaje': 'Borse e Bagagli',
    'Igienă dentară': 'Igiene Dentale', 'Pantaloni': 'Pantaloni',
    'Pantaloni Scurți': 'Pantaloncini', 'Pantaloni scurți': 'pantaloncini',
    'Încălțăminte': 'Calzature', 'Calculatoare': 'Computer', 'Genți': 'Borse',
    'Accesorii frumusețe': 'Accessori Beauty', 'Birotică': 'Cancelleria',
    'Electronice': 'Elettronica', 'Fashion': 'Moda', 'Men': 'Uomo',
    'Women': 'Donna', 'Kids': 'Bambini',
    'Încărcătoare & cabluri': 'Caricabatterie & Cavi',
    'Încărcătoare': 'Caricabatterie',
    'Cabluri': 'Cavi',
    'Căști': 'Cuffie',
    'Boxe': 'Casse',
    'Tricouri': 'Magliette',
    'Bluze': 'Camicette',
    'Pantofi': 'Scarpe',
    'Sandale': 'Sandali',
    'Adidași': 'Sneaker',
    'Ceasuri': 'Orologi',
    'Ochelari': 'Occhiali',
    'Parfumuri': 'Profumi',
    'Cosmetice': 'Cosmetici',
    'Jocuri': 'Giochi',
    'Cărți': 'Libri',
    'Lenjerie': 'Intimo',
    'Genți damă': 'Borse Donna',
    'Genți barbati': 'Borse Uomo',
    'Portofele': 'Portafogli',
  },
};

/**
 * Translate a (possibly compound) category like 'Fashion > Men > Pantaloni Scurți'
 * into a clean leaf label localized for the given locale. Falls back to the raw
 * leaf if no mapping exists.
 */
function translateCategory(raw, locale) {
  if (!raw) return '';
  const map = CATEGORY_MAP[locale] || {};
  // Try the whole string first (e.g. 'Modă')
  if (map[raw]) return map[raw];
  // Else extract last segment of '>' chain and map that
  const segments = String(raw).split(/\s*>\s*/).map((s) => s.trim()).filter(Boolean);
  const leaf = segments[segments.length - 1] || raw;
  return map[leaf] || leaf;
}

// Title pattern translations — RO regex → per-locale template
const TITLE_PATTERNS = {
  // [regex, { de, es, fr, pt, it }]
  topElectronice: [
    /Top (\d+) gadget-uri electronice care chiar merită (\d+)/i,
    {
      de: 'Top $1 elektronische Gadgets, die sich $2 wirklich lohnen',
      es: 'Top $1 gadgets electrónicos que realmente valen la pena en $2',
      fr: 'Top $1 gadgets électroniques qui valent vraiment le coup en $2',
      pt: 'Top $1 gadgets eletrónicos que valem mesmo a pena em $2',
      it: 'Top $1 gadget elettronici che valgono davvero la pena nel $2',
    },
  ],
  topPapuci: [
    /Top (\d+) papuci de casă pe care chiar îi cumpără lumea în (\d+)/i,
    {
      de: 'Top $1 Hausschuhe, die wirklich gekauft werden $2',
      es: 'Top $1 zapatillas de casa que la gente realmente compra en $2',
      fr: 'Top $1 chaussons que les gens achètent vraiment en $2',
      pt: 'Top $1 chinelos de casa que as pessoas realmente compram em $2',
      it: 'Top $1 pantofole da casa che la gente compra davvero nel $2',
    },
  ],
  topRochii: [
    /Cele mai vândute rochii de vară pe Swypik în (\d+)/i,
    {
      de: 'Meistverkaufte Sommerkleider auf Swypik in $1',
      es: 'Vestidos de verano más vendidos en Swypik en $1',
      fr: 'Robes d\'été les plus vendues sur Swypik en $1',
      pt: 'Vestidos de verão mais vendidos na Swypik em $1',
      it: 'Vestiti estivi più venduti su Swypik nel $1',
    },
  ],
  topFolii: [
    /Top (\d+) folii de protecție telefon (\d+).*$/i,
    {
      de: 'Top $1 Handy-Schutzfolien $2 — von echten Käufern getestet',
      es: 'Top $1 protectores de pantalla para móvil $2 — probados por compradores reales',
      fr: 'Top $1 protections d\'écran téléphone $2 — testées par de vrais acheteurs',
      pt: 'Top $1 películas de proteção para telemóvel $2 — testadas por compradores reais',
      it: 'Top $1 pellicole protettive per telefono $2 — testate da veri acquirenti',
    },
  ],
  topBirou: [
    /Top accesorii de birou \(Birotică\) cumpărate masiv în (\d+)/i,
    {
      de: 'Top Bürobedarf, der $1 massiv gekauft wird',
      es: 'Top accesorios de oficina más comprados en $1',
      fr: 'Top accessoires de bureau achetés massivement en $1',
      pt: 'Top acessórios de escritório mais comprados em $1',
      it: 'Top accessori da ufficio comprati in massa nel $1',
    },
  ],
  topCategorieReviews: [
    /Top produse din categoria (.+?) cu cele mai bune review-uri/i,
    {
      de: (m, p1) => `Top ${translateCategory(p1, 'de')}-Produkte mit den besten Bewertungen`,
      es: (m, p1) => `Top productos de ${translateCategory(p1, 'es')} con las mejores reseñas`,
      fr: (m, p1) => `Top produits ${translateCategory(p1, 'fr')} avec les meilleurs avis`,
      pt: (m, p1) => `Top produtos de ${translateCategory(p1, 'pt')} com as melhores avaliações`,
      it: (m, p1) => `Top prodotti ${translateCategory(p1, 'it')} con le migliori recensioni`,
    },
  ],
  saptamana: [
    /\(săpt\. (\d+)\/(\d+)\)/i,
    {
      de: '(Woche $1/$2)',
      es: '(Semana $1/$2)',
      fr: '(Semaine $1/$2)',
      pt: '(Semana $1/$2)',
      it: '(Settimana $1/$2)',
    },
  ],
};

function translateTitle(roTitle, articleCategory, locale) {
  let t = roTitle;
  let matched = false;
  for (const [name, [re, perLocale]] of Object.entries(TITLE_PATTERNS)) {
    const tpl = perLocale[locale];
    if (!tpl) continue;
    if (re.test(t)) {
      t = t.replace(re, tpl);
      matched = true;
    }
  }
  if (matched) return t;
  const cat = translateCategory(articleCategory, locale);
  if (cat) {
    const fallback = {
      de: `Top ${cat}-Produkte auf Swypik`,
      es: `Top productos de ${cat} en Swypik`,
      fr: `Top produits ${cat} sur Swypik`,
      pt: `Top produtos de ${cat} na Swypik`,
      it: `Top prodotti ${cat} su Swypik`,
    };
    return fallback[locale] || roTitle;
  }
  return roTitle;
}

function translateExcerpt(roExcerpt, n_products, category, locale) {
  if (!roExcerpt) return null;
  const cat = translateCategory(category, locale);
  const dict = {
    de: {
      withRating: `${n_products} ${cat}-Produkte haben eine Bewertung von 4,5+ und über 50 bestätigte Bestellungen. Hier ist die Top 7.`,
      sorted: `Top ${n_products} echte Produkte von Swypik, sortiert nach Bewertung und bestätigten Bestellungen. Daten werden regelmäßig aktualisiert.`,
      foliiSticla: `Panzerglas, Hydrogel und matte Schutzfolien — sortiert nach echter Bewertung (4,3+) und 23k+ Bestellungen. Hier sind die Sieger.`,
      generic: `Top ${n_products} Produkte aus echten Swypik-Katalogdaten. Bewertung, Preis und bestätigte Bestellungen inklusive.`,
    },
    es: {
      withRating: `${n_products} productos de ${cat} tienen una calificación de 4,5+ y más de 50 pedidos confirmados. Aquí está el top 7.`,
      sorted: `Top ${n_products} productos reales de Swypik, clasificados por calificación y pedidos confirmados. Datos actualizados regularmente.`,
      foliiSticla: `Cristal templado, hidrogel y protectores mate — clasificados por calificación real (4,3+) y más de 23k pedidos. Aquí están los ganadores.`,
      generic: `Top ${n_products} productos seleccionados de datos reales del catálogo Swypik. Incluye calificación, precio y pedidos confirmados.`,
    },
    fr: {
      withRating: `${n_products} produits en ${cat} ont une note de 4,5+ et plus de 50 commandes confirmées. Voici le top 7.`,
      sorted: `Top ${n_products} produits réels de Swypik, classés par note et nombre de commandes confirmées. Données mises à jour régulièrement.`,
      foliiSticla: `Verre trempé, hydrogel et protections mates — classés par note réelle (4,3+) et 23k+ commandes. Voici les gagnants.`,
      generic: `Top ${n_products} produits sélectionnés à partir des vraies données du catalogue Swypik. Note, prix et commandes confirmées inclus.`,
    },
    pt: {
      withRating: `${n_products} produtos de ${cat} têm classificação de 4,5+ e mais de 50 encomendas confirmadas. Aqui está o top 7.`,
      sorted: `Top ${n_products} produtos reais da Swypik, classificados por avaliação e encomendas confirmadas. Dados atualizados regularmente.`,
      foliiSticla: `Vidro temperado, hidrogel e películas mate — ordenados por avaliação real (4,3+) e mais de 23k encomendas. Eis os vencedores.`,
      generic: `Top ${n_products} produtos selecionados a partir de dados reais do catálogo Swypik. Avaliação, preço e encomendas confirmadas incluídos.`,
    },
    it: {
      withRating: `${n_products} prodotti in ${cat} hanno una valutazione di 4,5+ e oltre 50 ordini confermati. Ecco la top 7.`,
      sorted: `Top ${n_products} prodotti reali da Swypik, ordinati per valutazione e ordini confermati. Dati aggiornati regolarmente.`,
      foliiSticla: `Vetro temperato, hydrogel e pellicole opache — ordinati per valutazione reale (4,3+) e 23k+ ordini. Ecco i vincitori.`,
      generic: `Top ${n_products} prodotti selezionati dai dati reali del catalogo Swypik. Valutazione, prezzo e ordini confermati inclusi.`,
    },
  };
  const d = dict[locale];
  if (!d) return null;
  if (/au rating.*comenzi/i.test(roExcerpt)) return d.withRating;
  if (/extras top/i.test(roExcerpt) || /sortate dup/i.test(roExcerpt)) return d.sorted;
  if (/Folii de sticl/i.test(roExcerpt)) return d.foliiSticla;
  return d.generic;
}

// =====================================================================
// MDX section labels per locale
// =====================================================================
const MDX_LABELS = {
  de: {
    whyDifferent: 'Warum dieses Ranking anders ist',
    notEditorial: (minR, minO) => `Keine redaktionelle Auswahl — reine Daten. Wir haben jedes Produkt in dieser Kategorie mit **Bewertung ≥ ${minR}** und **${minO}+ bestätigten Bestellungen** auf Swypik gezogen und nach dem Score \`Bewertung × ln(1 + Bestellungen)\` sortiert.`,
    howWePicked: (date) => `**Wie wir ausgewählt haben** (Live-Daten, ${date}):`,
    bulletRating: (minR) => `- Käuferbewertung **≥ ${minR}** (von 5)`,
    bulletOrders: (minO) => `- mindestens **${minO} bestätigte Bestellungen**`,
    bulletStock: '- nur lagernde + sicherheitsgefilterte Produkte (`is_adult=false`, `effective_label=\'safe\'`)',
    bulletFormula: '- Rankingformel: `Bewertung × ln(1 + Bestellungen)` — favorisiert Produkte, die sowohl gut bewertet ALS auch gekauft werden',
    bestseller: '#1 BESTSELLER',
    whyOne: 'Warum es #1 ist',
    realRating: (r, stars, o, p) => `> Echte Bewertung: **${r}/5** ${stars} · **${o} bestätigte Bestellungen** · RON ${p}`,
    h2Rest: (n) => `## #2 – #${n}`,
    allHaveText: (minO, minR) => `Alle haben **${minO}+ bestätigte Bestellungen** und Bewertung **${minR}+**:`,
    rowMeta: (r, stars, o, p) => `*Bewertung: **${r}/5** ${stars} · ${o} Bestellungen · RON ${p}*`,
    howBuyTitle: 'Sicher auf Swypik kaufen',
    howBuyBody: 'Alle oben genannten Produkte sind von unserem Team verifiziert: echter Bestand, Beschreibung in deiner Sprache, transparente Preise, verfolgte Lieferung. Klick auf eine Karte, um direkt zum Produkt zu gelangen — in den Warenkorb legen und fertig.',
    refresh: '*Dieser Artikel wird wöchentlich mit den neuesten Katalogdaten aktualisiert.*',
    dateLocale: 'de-DE',
    numLocale: 'de-DE',
    decimalSep: ',',
  },
  es: {
    whyDifferent: 'Por qué este ranking es diferente',
    notEditorial: (minR, minO) => `No es una selección editorial — son datos puros. Extrajimos cada producto de esta categoría con **calificación ≥ ${minR}** y **${minO}+ pedidos confirmados** en Swypik, y luego los clasificamos por puntuación compuesta \`calificación × ln(1 + pedidos)\`.`,
    howWePicked: (date) => `**Cómo elegimos** (datos en vivo, ${date}):`,
    bulletRating: (minR) => `- calificación del comprador **≥ ${minR}** (sobre 5)`,
    bulletOrders: (minO) => `- mínimo **${minO} pedidos confirmados**`,
    bulletStock: '- solo productos en stock + filtrados por seguridad (`is_adult=false`, `effective_label=\'safe\'`)',
    bulletFormula: '- fórmula de ranking: `calificación × ln(1 + pedidos)` — favorece productos bien calificados Y comprados',
    bestseller: '#1 MÁS VENDIDO',
    whyOne: 'Por qué es el #1',
    realRating: (r, stars, o, p) => `> Calificación real: **${r}/5** ${stars} · **${o} pedidos confirmados** · RON ${p}`,
    h2Rest: (n) => `## #2 – #${n}`,
    allHaveText: (minO, minR) => `Todos tienen **${minO}+ pedidos confirmados** y calificación **${minR}+**:`,
    rowMeta: (r, stars, o, p) => `*Calificación: **${r}/5** ${stars} · ${o} pedidos · RON ${p}*`,
    howBuyTitle: 'Cómo comprar de forma segura en Swypik',
    howBuyBody: 'Todos los productos anteriores son verificados por nuestro equipo: stock real, descripción en tu idioma, precios transparentes, envío con seguimiento. Haz clic en cualquier tarjeta para ir directo al producto — añade al carrito y listo.',
    refresh: '*Este artículo se actualiza semanalmente con los últimos datos del catálogo.*',
    dateLocale: 'es-ES',
    numLocale: 'es-ES',
    decimalSep: ',',
  },
  fr: {
    whyDifferent: 'Pourquoi ce classement est différent',
    notEditorial: (minR, minO) => `Pas de choix éditoriaux — que des données. Nous avons sorti chaque produit de cette catégorie avec **note ≥ ${minR}** et **${minO}+ commandes confirmées** sur Swypik, puis classés par score composite \`note × ln(1 + commandes)\`.`,
    howWePicked: (date) => `**Comment nous avons choisi** (données en direct, ${date}) :`,
    bulletRating: (minR) => `- note des acheteurs **≥ ${minR}** (sur 5)`,
    bulletOrders: (minO) => `- minimum **${minO} commandes confirmées**`,
    bulletStock: '- uniquement produits en stock + filtrés sécurité (`is_adult=false`, `effective_label=\'safe\'`)',
    bulletFormula: '- formule de classement : `note × ln(1 + commandes)` — favorise les produits à la fois bien notés ET achetés',
    bestseller: '#1 MEILLEURE VENTE',
    whyOne: 'Pourquoi c\'est le #1',
    realRating: (r, stars, o, p) => `> Note réelle : **${r}/5** ${stars} · **${o} commandes confirmées** · RON ${p}`,
    h2Rest: (n) => `## #2 – #${n}`,
    allHaveText: (minO, minR) => `Tous ont **${minO}+ commandes confirmées** et une note **${minR}+** :`,
    rowMeta: (r, stars, o, p) => `*Note : **${r}/5** ${stars} · ${o} commandes · RON ${p}*`,
    howBuyTitle: 'Acheter en toute sécurité sur Swypik',
    howBuyBody: 'Tous les produits ci-dessus sont vérifiés par notre équipe : stock réel, description dans ta langue, prix transparents, livraison suivie. Clique sur une carte pour aller directement au produit — ajoute au panier et c\'est fait.',
    refresh: '*Cet article est rafraîchi chaque semaine avec les dernières données du catalogue.*',
    dateLocale: 'fr-FR',
    numLocale: 'fr-FR',
    decimalSep: ',',
  },
  pt: {
    whyDifferent: 'Porque este ranking é diferente',
    notEditorial: (minR, minO) => `Não são escolhas editoriais — são dados puros. Extraímos todos os produtos desta categoria com **avaliação ≥ ${minR}** e **${minO}+ encomendas confirmadas** na Swypik, depois ordenados pelo score composto \`avaliação × ln(1 + encomendas)\`.`,
    howWePicked: (date) => `**Como escolhemos** (dados em direto, ${date}):`,
    bulletRating: (minR) => `- avaliação do comprador **≥ ${minR}** (em 5)`,
    bulletOrders: (minO) => `- mínimo **${minO} encomendas confirmadas**`,
    bulletStock: '- apenas produtos em stock + filtrados por segurança (`is_adult=false`, `effective_label=\'safe\'`)',
    bulletFormula: '- fórmula de ranking: `avaliação × ln(1 + encomendas)` — favorece produtos bem avaliados E comprados',
    bestseller: '#1 MAIS VENDIDO',
    whyOne: 'Porque é o #1',
    realRating: (r, stars, o, p) => `> Avaliação real: **${r}/5** ${stars} · **${o} encomendas confirmadas** · RON ${p}`,
    h2Rest: (n) => `## #2 – #${n}`,
    allHaveText: (minO, minR) => `Todos têm **${minO}+ encomendas confirmadas** e avaliação **${minR}+**:`,
    rowMeta: (r, stars, o, p) => `*Avaliação: **${r}/5** ${stars} · ${o} encomendas · RON ${p}*`,
    howBuyTitle: 'Como comprar com segurança na Swypik',
    howBuyBody: 'Todos os produtos acima são verificados pela nossa equipa: stock real, descrição na tua língua, preços transparentes, envio rastreado. Clica em qualquer cartão para ir direto ao produto — adiciona ao carrinho e está feito.',
    refresh: '*Este artigo é atualizado semanalmente com os últimos dados do catálogo.*',
    dateLocale: 'pt-PT',
    numLocale: 'pt-PT',
    decimalSep: ',',
  },
  it: {
    whyDifferent: 'Perché questa classifica è diversa',
    notEditorial: (minR, minO) => `Non sono scelte editoriali — solo dati. Abbiamo estratto ogni prodotto di questa categoria con **valutazione ≥ ${minR}** e **${minO}+ ordini confermati** su Swypik, poi ordinati per punteggio composito \`valutazione × ln(1 + ordini)\`.`,
    howWePicked: (date) => `**Come abbiamo scelto** (dati live, ${date}):`,
    bulletRating: (minR) => `- valutazione dell'acquirente **≥ ${minR}** (su 5)`,
    bulletOrders: (minO) => `- minimo **${minO} ordini confermati**`,
    bulletStock: '- solo prodotti disponibili + filtrati per sicurezza (`is_adult=false`, `effective_label=\'safe\'`)',
    bulletFormula: '- formula di ranking: `valutazione × ln(1 + ordini)` — favorisce prodotti sia ben valutati CHE acquistati',
    bestseller: '#1 BESTSELLER',
    whyOne: 'Perché è il #1',
    realRating: (r, stars, o, p) => `> Valutazione reale: **${r}/5** ${stars} · **${o} ordini confermati** · RON ${p}`,
    h2Rest: (n) => `## #2 – #${n}`,
    allHaveText: (minO, minR) => `Tutti hanno **${minO}+ ordini confermati** e valutazione **${minR}+**:`,
    rowMeta: (r, stars, o, p) => `*Valutazione: **${r}/5** ${stars} · ${o} ordini · RON ${p}*`,
    howBuyTitle: 'Come comprare in sicurezza su Swypik',
    howBuyBody: 'Tutti i prodotti sopra sono verificati dal nostro team: scorte reali, descrizione nella tua lingua, prezzi trasparenti, spedizione tracciata. Clicca su una scheda per andare direttamente al prodotto — aggiungi al carrello e fatto.',
    refresh: '*Questo articolo viene aggiornato settimanalmente con gli ultimi dati del catalogo.*',
    dateLocale: 'it-IT',
    numLocale: 'it-IT',
    decimalSep: ',',
  },
};

// =====================================================================
// MDX builder per locale
// =====================================================================
function fmtPrice(price_cents, numLocale) {
  if (!price_cents) return null;
  return (Number(price_cents) / 100).toLocaleString(numLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ratingStars(r) {
  const n = Math.round(Number(r) || 0);
  return '★'.repeat(Math.min(5, Math.max(0, n))) + '☆'.repeat(Math.max(0, 5 - n));
}
function escapeMdx(s) {
  if (!s) return '';
  return String(s).replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

function buildLocaleMdx(article, products, locale) {
  if (!products.length) return null;
  const L = MDX_LABELS[locale];
  const featured = products[0];
  const rest = products.slice(1);
  const minRating = article.generator_meta?.query?.minRating ?? 4.5;
  const minOrders = article.generator_meta?.query?.minOrders ?? 50;
  const formattedRating = String(minRating).replace('.', L.decimalSep);
  const dateStr = new Date(article.published_at || Date.now()).toLocaleDateString(L.dateLocale, { day: 'numeric', month: 'long', year: 'numeric' });

  const lines = [];
  lines.push(`## ${L.whyDifferent}`);
  lines.push('');
  lines.push(L.notEditorial(formattedRating, minOrders));
  lines.push('');
  lines.push(L.howWePicked(dateStr));
  lines.push(L.bulletRating(formattedRating));
  lines.push(L.bulletOrders(minOrders));
  lines.push(L.bulletStock);
  lines.push(L.bulletFormula);
  lines.push('');
  lines.push(`## 🏆 #1 — ${escapeMdx(featured.title_loc || featured.title_ro)}`);
  lines.push('');
  lines.push(`<InlineProductCard productId="${featured.id}" variant="featured" badge="${L.bestseller}" />`);
  lines.push('');
  if (featured.desc_loc) {
    const desc = String(featured.desc_loc).slice(0, 320);
    lines.push(`**${L.whyOne}**: ${escapeMdx(desc)}${featured.desc_loc.length > 320 ? '...' : ''}`);
    lines.push('');
  }
  const fRating = Number(featured.rating).toFixed(1).replace('.', L.decimalSep);
  const fOrders = Number(featured.orders).toLocaleString(L.numLocale);
  const fPrice = fmtPrice(featured.price_cents, L.numLocale);
  lines.push(L.realRating(fRating, ratingStars(featured.rating), fOrders, fPrice));
  lines.push('');
  lines.push(L.h2Rest(products.length));
  lines.push('');
  lines.push(L.allHaveText(minOrders, formattedRating));
  lines.push('');
  rest.forEach((p, i) => {
    const pos = i + 2;
    lines.push(`### ${pos}. ${escapeMdx(p.title_loc || p.title_ro)}`);
    lines.push('');
    lines.push(`<InlineProductCard productId="${p.id}" variant="compact" />`);
    lines.push('');
    const pRating = Number(p.rating).toFixed(1).replace('.', L.decimalSep);
    const pOrders = Number(p.orders).toLocaleString(L.numLocale);
    const pPrice = fmtPrice(p.price_cents, L.numLocale);
    lines.push(L.rowMeta(pRating, ratingStars(p.rating), pOrders, pPrice));
    if (p.desc_loc) {
      lines.push('');
      lines.push(escapeMdx(String(p.desc_loc).slice(0, 200)));
    }
    lines.push('');
  });
  lines.push(`---`);
  lines.push('');
  lines.push(`### ${L.howBuyTitle}`);
  lines.push('');
  lines.push(L.howBuyBody);
  lines.push('');
  lines.push(L.refresh);
  return lines.join('\n');
}

// =====================================================================
// Fetch products with locale-specific translations
// =====================================================================
async function fetchProductsForLocale(client, productIds, locale) {
  if (!productIds.length) return [];
  const sql = `
    SELECT p.id,
           p.title AS title_default,
           p.brand, p.category,
           p.price_cents, p.currency, p.image_url,
           p.rating_numeric AS rating,
           p.orders_count_int AS orders,
           p.description AS desc_default,
           pt_loc.title AS title_loc,
           pt_loc.description AS desc_loc,
           pt_ro.title AS title_ro,
           pt_ro.description AS desc_ro
    FROM marketplace_products p
    LEFT JOIN product_translations pt_loc
      ON pt_loc.product_id = p.id AND pt_loc.locale = $2
    LEFT JOIN product_translations pt_ro
      ON pt_ro.product_id = p.id AND pt_ro.locale = 'ro'
    WHERE p.id = ANY($1::uuid[])
  `;
  const { rows } = await client.query(sql, [productIds, locale]);
  const byId = new Map(rows.map(r => [r.id, r]));
  return productIds.map(id => byId.get(id)).filter(Boolean);
}

// =====================================================================
// MAIN
// =====================================================================
async function processArticleLocale(client, article, locale) {
  const products = await fetchProductsForLocale(client, article.linked_product_ids || [], locale);
  if (products.length < 3) {
    console.warn(`[${article.slug}/${locale}] SKIP — only ${products.length} products`);
    return { slug: article.slug, locale, status: 'too_few' };
  }

  const title = translateTitle(article.title, article.category, locale);
  const excerpt = translateExcerpt(article.excerpt, products.length, article.category, locale);
  const mdx = buildLocaleMdx(article, products, locale);
  if (!mdx) return { slug: article.slug, locale, status: 'empty' };

  if (!APPLY) {
    console.log(`[${article.slug}/${locale}] DRY preview:`);
    console.log(`  title:   ${title}`);
    console.log(`  excerpt: ${(excerpt || '').slice(0, 100)}`);
    console.log(`  mdx (first 200): ${mdx.slice(0, 200).replace(/\n/g, ' ')}`);
    return { slug: article.slug, locale, status: 'dry' };
  }

  const slug = article.slug;
  const seoTitle = `${title} | Swypik`;

  await client.query(`
    INSERT INTO blog_article_translations
      (article_id, locale, title, excerpt, body_mdx, slug, seo_title, seo_description, source, model_tag)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, 'template-' || $2 || '-v1', 'native-' || $2 || '-template')
    ${FORCE ? 'ON CONFLICT (article_id, locale) DO UPDATE SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_mdx=EXCLUDED.body_mdx, slug=EXCLUDED.slug, seo_title=EXCLUDED.seo_title, seo_description=EXCLUDED.seo_description, source=EXCLUDED.source, model_tag=EXCLUDED.model_tag, updated_at=now()' : 'ON CONFLICT (article_id, locale) DO NOTHING'}
    RETURNING article_id
  `, [
    article.id, locale, title, excerpt, mdx, slug, seoTitle, excerpt,
  ]);

  console.log(`[${article.slug}/${locale}] ✓ inserted`);
  return { slug: article.slug, locale, status: 'inserted', title };
}

async function main() {
  const client = await pool.connect();
  try {
    const where = ONLY_SLUG ? `WHERE a.slug=$1 AND a.locale='ro'` : `WHERE a.locale='ro' AND a.status='published'`;
    const sql = `
      SELECT a.id, a.slug, a.title, a.excerpt, a.category, a.tags,
             a.linked_product_ids, a.generator_meta, a.published_at
      FROM blog_articles a
      ${where}
      ORDER BY a.published_at DESC
    `;
    const { rows: articles } = ONLY_SLUG ? await client.query(sql, [ONLY_SLUG]) : await client.query(sql);
    console.log(`\nFound ${articles.length} RO articles · Locales: ${LOCALES.join(',')}`);

    // For each article × locale, check if needs translation
    const existingSql = `
      SELECT article_id, locale
      FROM blog_article_translations
      WHERE locale = ANY($1::text[])
        AND article_id = ANY($2::uuid[])
    `;
    const { rows: existing } = await client.query(existingSql, [LOCALES, articles.map(a => a.id)]);
    const existsSet = new Set(existing.map(e => `${e.article_id}|${e.locale}`));

    const results = [];
    for (const article of articles) {
      for (const locale of LOCALES) {
        const key = `${article.id}|${locale}`;
        if (existsSet.has(key) && !FORCE) {
          results.push({ slug: article.slug, locale, status: 'skip-exists' });
          continue;
        }
        try {
          const r = await processArticleLocale(client, article, locale);
          results.push(r);
        } catch (err) {
          console.error(`[${article.slug}/${locale}] ERROR`, err.message);
          results.push({ slug: article.slug, locale, status: 'error', error: err.message });
        }
      }
    }

    console.log('\n===== SUMMARY =====');
    const byStatus = results.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});
    console.table(byStatus);
    console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY'}${FORCE ? ' (FORCE)' : ''}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
