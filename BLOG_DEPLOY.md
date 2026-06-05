# 📖 Blog Integration — Deploy Guide

**Branch sugerat**: `feat/blog-integration` (sau direct pe `feat/vision24-integration`)

## ✅ Ce s-a adăugat

### DB (1 migration + 1 seed)
- `db/migrations/20260605_0001_blog_articles.sql` — schema completă (tabele + FTS + triggers + owner align)
- `db/seeds/blog_articles_demo.sql` — 3 articole demo (idempotent, `ON CONFLICT DO NOTHING`)

### Backend (lib + API)
- `lib/db/blog-queries.ts` — query layer (list/get/search/sitemap)
- `app/api/blog/articles/route.ts` — `GET /api/blog/articles?category=&search=&limit=&offset=`
- `app/api/blog/articles/[slug]/route.ts` — `GET /api/blog/articles/{slug}` (+ view bump)

### Pagini publice (SEO)
- `app/blog/page.tsx` — `swypik.com/blog` (CollectionPage + JSON-LD)
- `app/blog/[slug]/page.tsx` — `swypik.com/blog/{slug}` (Article schema + breadcrumbs + OG)
- `app/blog/sitemap.xml/route.ts` — sitemap pentru `/blog/*`
- `app/sitemap.xml/route.ts` — **modificat**: include `/blog/sitemap.xml` în index

### UI (in-app, mountat în ChatInterface)
- `components/blog/BlogHub.tsx` — hub-ul din tab nou (categorii + search + grid)
- `components/blog/BlogTeaser.tsx` — card violet promovare pe Home tab
- `components/blog/BlogArticleBody.tsx` — render MDX cu `<InlineProductCard>` / `<ProductRow>` / `<Callout>`
- `components/blog/InlineProductCard.tsx` — 3 variante (compact / featured / comparison) cu add-to-cart

### ChatInterface — **modificări minime** (3 schimbări)
- `Tab` type extins cu `"blog"`
- Bottom nav `grid-cols-6` → `grid-cols-7` + buton "Ghiduri" cu icon `BookOpen`
- Render condițional `{activeTab === "blog" && <BlogHub />}`
- `<BlogTeaser onOpenHub={() => setActiveTab("blog")} />` adăugat între caruselele Home

---

## 🚀 Deploy pe VPS — pași

### 1. Pull code pe VPS

```bash
ssh -i .ssh_hetzner_key root@<HETZNER_IP>
cd /var/www/swypik
git pull origin feat/blog-integration  # sau feat/vision24-integration
```

### 2. Aplică migrația

```bash
psql "$DATABASE_URL" -f db/migrations/20260605_0001_blog_articles.sql
```

Migrația e **idempotentă** (`CREATE TABLE IF NOT EXISTS`), poți rula de N ori în siguranță.

### 3. (Opțional) Aplică seed demo

⚠️ **Înainte** de seed, înlocuiește `linked_product_ids` în `db/seeds/blog_articles_demo.sql` cu **pgIds reale** din `marketplace_products`:

```sql
-- Găsește pgIds pentru organizatoare birou (exemplu)
SELECT pg_id, title, price_ron
FROM marketplace_products
WHERE category ILIKE '%organiz%' AND status='active' AND effective_label='safe'
ORDER BY view_count DESC NULLS LAST
LIMIT 10;
```

Apoi rulează:
```bash
psql "$DATABASE_URL" -f db/seeds/blog_articles_demo.sql
```

### 4. Deploy Next.js

```bash
./safe-deploy-web.sh
```

### 5. Validare

```bash
# API
curl -s https://swypik.com/api/blog/articles?limit=3 | jq

# Pagina publică
curl -s https://swypik.com/blog | head -50

# Sitemap (Google)
curl -s https://swypik.com/blog/sitemap.xml
curl -s https://swypik.com/sitemap.xml | grep blog
```

### 6. Submit la Google Search Console

- Adaugă proprietatea (deja există)
- Inspect URL → `https://swypik.com/blog` → Request indexing
- Sitemaps tab → confirm `/sitemap.xml` (deja include `/blog/sitemap.xml`)

---

## 📊 SEO Impact așteptat

| Metric | Înainte | După |
|---|---|---|
| URL-uri indexabile | ~30k produse | +10-50 articole long-tail |
| Schema.org types | Product, Organization | + Article, BreadcrumbList, CollectionPage |
| OG previews | doar produse | + articole cu hero image custom |
| Long-tail keywords | "organizator birou ieftin" | "top 10 organizatoare birou testate 2026" |
| Internal linking | Product → Product | + Article → Product (transfer authority) |

**Estimare conservatoare** (3-6 luni): +15-30% trafic organic dacă publicăm 2-4 articole/lună cu focus pe **buyer intent keywords**.

---

## 🎨 Cum scrii un articol nou

1. Conectează-te la admin (în VPS, prin DB direct sau viitor `/admin/blog`):

```sql
INSERT INTO blog_articles (slug, title, excerpt, body_mdx, category, tags, status, published_at)
VALUES (
  'kit-skincare-coreean-incepatori-2026',
  'Kit skincare coreean pentru începători (sub 250 lei)',
  'Cele 5 produse esențiale pentru rutina de bază K-beauty.',
  $MDX$
## Introducere
Text aici...

<InlineProductCard productId="555" variant="featured" badge="STARTER PICK" />

## Pasul 1: cleanser
<InlineProductCard productId="556" variant="compact" />
$MDX$,
  'beauty',
  ARRAY['skincare', 'kbeauty', 'rutina', 'incepatori'],
  'published',
  NOW()
);
```

2. MDX support:
   - **Markdown**: `# h1`, `## h2`, `### h3`, `- list`, `> quote`, `**bold**`, `*italic*`, `[link](url)`
   - **Custom tags**:
     - `<InlineProductCard productId="N" variant="compact|featured|comparison" badge="STAR" />`
     - `<ProductRow ids="1,2,3" />` (auto-grid 2-up cu variant=comparison)
     - `<Callout type="tip|warning|success|info">Text...</Callout>`

3. Inline product card fetch-uiește live `/api/products/[id]` → preț real, stoc real, add-to-cart funcțional.

---

## 🔧 Rollback

Dacă vrei să dezactivezi totul instant fără să rulezi DROP TABLE:

```sql
-- Ascunde articolele (fără a șterge date)
UPDATE blog_articles SET status='archived' WHERE status='published';
```

UI-ul în `BlogHub` & `BlogTeaser` se ascunde automat când nu sunt articole `published`. Tab-ul "Ghiduri" rămâne vizibil dar afișează empty state.

Pentru rollback complet (DROP):
```sql
DROP TABLE IF EXISTS blog_article_products CASCADE;
DROP TABLE IF EXISTS blog_article_translations CASCADE;
DROP TABLE IF EXISTS blog_articles CASCADE;
DROP FUNCTION IF EXISTS tg_blog_articles_touch_updated_at() CASCADE;
DROP FUNCTION IF EXISTS tg_blog_articles_sync_linked_products() CASCADE;
```

În cod, revert commit-urile din branch.
