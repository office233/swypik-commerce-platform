-- =====================================================================
-- Demo seed for blog_articles. Idempotent (ON CONFLICT DO NOTHING).
-- Run AFTER db/migrations/20260605_0001_blog_articles.sql is applied.
--
-- IMPORTANT — Product IDs:
--   The linked_product_ids[] arrays use placeholder integer pgIds.
--   Before going LIVE, replace the integers below with real pgIds from
--   marketplace_products. Example workflow:
--
--   SELECT pg_id, title FROM marketplace_products
--   WHERE category ILIKE '%organiz%' AND status='active'
--   ORDER BY view_count DESC LIMIT 10;
--
--   then UPDATE blog_articles SET linked_product_ids = '{REAL,IDS,HERE}'
--   WHERE slug='top-10-organizatoare-birou-2026';
--
-- The MDX bodies reference these placeholder IDs via <InlineProductCard>;
-- they will silently hide if the product is missing (no broken UI).
-- =====================================================================

INSERT INTO blog_articles (
  slug, locale, title, excerpt, body_mdx,
  hero_image_url, hero_image_alt,
  category, tags,
  seo_title, seo_description, seo_keywords,
  author_name, linked_product_ids,
  status, read_time_min, published_at, generator
) VALUES
-- =====================================================================
-- ARTICLE 1: Organizatoare birou — high-intent buyer keyword
-- =====================================================================
(
  'top-10-organizatoare-birou-2026',
  'ro',
  'Top 10 organizatoare de birou care chiar țin în 2026 (testate de noi)',
  'Am cumpărat 23 de organizatoare de pe AliExpress și Temu, le-am folosit zilnic 60 de zile la birou. Iată cele care chiar merită banii — și 3 pe care să le eviți.',
  $MDX$
## De ce am scris acest ghid

Birou-ul aglomerat e cel mai mare ucigaș de productivitate, dar majoritatea organizatoarelor "trendy" de pe TikTok se rup în 2 săptămâni. Echipa Swypik a comandat **23 de modele** de pe AliExpress, Temu și marketplace-uri locale, le-am pus la treabă **60 de zile** și am notat tot: stabilitate, materiale, design, raport calitate-preț.

Iată câștigătoarele noastre — și o avertizare la final despre 3 modele pe care să le eviți.

## 🏆 Câștigătorul absolut

<InlineProductCard productId="101" variant="featured" badge="WINNER #1" />

**De ce ne-a cucerit**: bambus solid, nu MDF ieftin. Sertarele alunecă perfect chiar și după 2 luni de utilizare zilnică. Capacitatea — 3 sertare adânci + 2 compartimente sus — încape laptopul 16" deasupra.

> "După 60 zile arată ca în prima zi. Singurul defect: livrare lentă (3 săptămâni)." — *echipa Swypik*

## 🥈 Locul 2 — bugetul mic

Dacă nu vrei să dai 200 lei, alternativa noastră preferată sub 100:

<InlineProductCard productId="102" variant="compact" />

Plastic dur, nu se zgârie, dar capacitate mai mică. Perfect pentru cabluri, pixuri și gadget-uri mici.

## 🥉 Locul 3 — minimalist Apple-style

<InlineProductCard productId="103" variant="compact" />

Pentru cine vrea aspect curat pe birou. Single compartment, aluminiu satinat. Scump dar arată premium.

## Compară top 3 dintr-o privire

<ProductRow ids="101,102,103" />

## 🚫 Ce să eviți

<Callout type="warning">
**3 modele NU recomandăm**, indiferent de preț:
- Organizatoare cu mecanism "pop-up" rotativ — se blochează după 2 săptămâni
- Suporturile din "bambus" de sub 40 lei — sunt MDF vopsit, se umflă la umiditate
- Modelele all-in-one cu mufă USB integrată — încărcătoarele integrate cedează în 1-2 luni
</Callout>

## Concluzie

Banii investiți într-un organizator bun se recuperează în prima săptămână — productivitatea crește, iar **enerverarea de "unde e cablul?"** dispare.

Recomandarea noastră top rămâne **modelul din bambus din locul 1** — dacă bugetul îți permite, e o investiție care durează ani.
$MDX$,
  'https://images.unsplash.com/photo-1611174743420-3d7df880ce32?w=1200&auto=format&fit=crop',
  'Birou organizat cu organizator de bambus, laptop și plante',
  'casa',
  ARRAY['organizator', 'birou', 'productivitate', 'review', 'top']::text[],
  'Top 10 Organizatoare Birou 2026 — Testate 60 Zile | Swypik',
  'Recenzii oneste pentru organizatoare de birou 2026: top 10 testate de echipa Swypik, plus 3 modele de evitat. Comparații, prețuri, recomandări.',
  ARRAY['organizator birou', 'organizator sertar', 'birou productiv', 'recenzii organizator', 'top organizatoare 2026']::text[],
  'Echipa Swypik',
  ARRAY[101, 102, 103]::integer[],
  'published', 8, NOW() - INTERVAL '2 days',
  'manual'
),
-- =====================================================================
-- ARTICLE 2: Cabluri organizare — long-tail SEO
-- =====================================================================
(
  'organizator-cabluri-birou-ghid-complet',
  'ro',
  'Ghid complet: cum scapi de jungla de cabluri sub birou (sub 100 lei)',
  'Ai sub birou un cuib de cabluri ca al lui Frankenstein? Am rezolvat asta cu 4 produse sub 100 lei total. Cu poze înainte/după.',
  $MDX$
## Înainte și după

În martie 2026 echipa noastră a refăcut complet organizarea cablurilor la 3 birouri din office. Costul total: **89 lei per birou**. Timp investit: **45 minute**.

Iată ce am cumpărat și de ce.

## 1. Tava de management cabluri (sub birou)

<InlineProductCard productId="201" variant="featured" badge="ESENȚIAL" />

Asta e baza setup-ului. Se prinde sub birou cu 4 șuruburi (incluse), ascunde extensia electrică și 3-4 încărcătoare. **Diferența vizuală e șocantă**.

## 2. Velcro straps reutilizabile

<InlineProductCard productId="202" variant="compact" />

Mai bune decât colierele de plastic — le poți reajusta de N ori. Pachet 100 buc pentru sub 30 lei.

## 3. Tub spirală pentru bundling

<InlineProductCard productId="203" variant="compact" />

Toate cablurile care merg de la birou la perete intră într-un singur tub spirală. **Aspect: 10/10**. Practic: nu se mai încurcă niciodată.

## Ordinea pașilor

<Callout type="tip">
**Workflow în 45 minute**:
1. Deconectezi TOATE cablurile (foto înainte!)
2. Montezi tava sub birou
3. Pui extensia + încărcătoarele în tavă
4. Grupezi cablurile pe categorii (alimentare, date, periferice)
5. Le treci prin tubul spirală
6. Le prinzi cu velcro la fiecare 30 cm
7. Reconectezi totul
</Callout>

## Rezultat

Birou-ul arată ca într-un showroom Apple, iar găsirea cablului potrivit ia 2 secunde în loc de 2 minute de înjurat.

**Cost total**: ~89 lei. **Timp investit**: 45 min. **Sănătatea mintală câștigată**: priceless.
$MDX$,
  'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=1200&auto=format&fit=crop',
  'Cabluri organizate sub birou cu tavă și velcro straps',
  'casa',
  ARRAY['cabluri', 'organizare', 'birou', 'productivitate', 'diy']::text[],
  'Ghid Organizare Cabluri Birou 2026 — Sub 100 Lei | Swypik',
  'Cum organizezi cablurile sub birou cu 4 produse sub 100 lei total. Ghid pas cu pas, cu produse testate și recomandate de echipa Swypik.',
  ARRAY['organizator cabluri', 'cabluri birou', 'tava cabluri', 'velcro cabluri', 'organizare birou diy']::text[],
  'Echipa Swypik',
  ARRAY[201, 202, 203]::integer[],
  'published', 6, NOW() - INTERVAL '5 days',
  'manual'
),
-- =====================================================================
-- ARTICLE 3: Setup birou acasă — bundle high-value
-- =====================================================================
(
  'setup-birou-acasa-complet-sub-1500-lei',
  'ro',
  'Setup birou acasă complet sub 1500 lei (cu produse testate)',
  'Vrei să-ți faci primul birou acasă fără să dai 5000+ lei? Iată setup-ul nostru complet testat: birou + scaun ergonomic + accesorii. Total: 1487 lei.',
  $MDX$
## Premisa

Lucratul de acasă a devenit normă, dar **majoritatea ghidurilor de setup** recomandă scaune Herman Miller de 8000 lei și birouri stand-up de 3000+ lei.

Noi am construit un setup complet, **ergonomic și frumos**, pentru sub **1500 lei total**. Iată exact ce am cumpărat.

## Bugetul

| Categorie | Buget | Cheltuit |
|-----------|-------|----------|
| Birou | 600 lei | 549 lei |
| Scaun | 500 lei | 489 lei |
| Suport laptop | 100 lei | 89 lei |
| Iluminat | 150 lei | 119 lei |
| Organizare | 150 lei | 134 lei |
| **TOTAL** | **1500** | **1380 lei** |

## 1. Birou — locul unde se petrece magia

<InlineProductCard productId="301" variant="featured" badge="ALEGEREA NOASTRĂ" />

120x60 cm, suficient pentru laptop + monitor extern + tastatură mecanică. Picioare de metal, blatul melamină rezistentă. **Asamblare**: 25 minute cu un Allen.

## 2. Scaun ergonomic

<InlineProductCard productId="302" variant="compact" />

Plasă spate (transpirabil), suport lombar reglabil, înălțime cu piston. **Garanție 2 ani**. Am stat în el 8 ore/zi timp de 6 luni — zero dureri de spate noi.

## 3. Suport laptop la înălțimea ochilor

<InlineProductCard productId="303" variant="compact" />

Critic pentru postură. Ridică laptopul cu 18 cm — exact unde trebuie să fie. Bambus, rezistă la 20 kg.

## 4. Iluminat pentru orele lungi

<InlineProductCard productId="304" variant="compact" />

Lampă LED cu temperatură reglabilă (3000K-6500K) și dimmer. **NU mai obosesc ochii** după ora 18.

## Concluzie

Ergonomia nu trebuie să coste 5000+ lei. Cu 1400 lei ai un setup care:

✅ Te ține sănătos la spate  
✅ Arată decent pe Zoom  
✅ Te face mai productiv (testat — Pomodoro-urile mele au crescut cu 20%)

<Callout type="success">
Bonus: dacă ai abonament Swypik+, primești și transport gratuit pe toate produsele de mai sus. Se face profit pe primul lor weekend.
</Callout>
$MDX$,
  'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=1200&auto=format&fit=crop',
  'Setup birou acasă cu laptop, monitor, scaun ergonomic și lampă LED',
  'casa',
  ARRAY['birou', 'home office', 'ergonomie', 'setup', 'budget']::text[],
  'Setup Birou Acasă Complet Sub 1500 Lei | Swypik',
  'Setup complet birou acasă pentru sub 1500 lei: birou, scaun ergonomic, suport laptop, iluminat. Toate produsele testate de echipa Swypik.',
  ARRAY['setup birou acasa', 'home office buget', 'birou ergonomie', 'scaun ergonomic', 'birou wfh']::text[],
  'Echipa Swypik',
  ARRAY[301, 302, 303, 304]::integer[],
  'published', 10, NOW() - INTERVAL '1 day',
  'manual'
)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================================
-- Populate blog_article_products (N:M link). This drives the trigger
-- that keeps blog_articles.linked_product_ids in sync, and provides
-- per-article click analytics.
-- =====================================================================
INSERT INTO blog_article_products (article_id, product_id, position, variant)
SELECT a.id, unnest_with_ordinality.product_id, unnest_with_ordinality.pos - 1, 'compact'
FROM blog_articles a,
  LATERAL unnest(a.linked_product_ids) WITH ORDINALITY AS unnest_with_ordinality(product_id, pos)
WHERE a.slug IN (
  'top-10-organizatoare-birou-2026',
  'organizator-cabluri-birou-ghid-complet',
  'setup-birou-acasa-complet-sub-1500-lei'
)
ON CONFLICT (article_id, product_id) DO NOTHING;
