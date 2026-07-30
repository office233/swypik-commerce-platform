/**
 * Import produse reale din Meister ERP în catalogul Swypik.
 *
 * Sursa:  GET /api/swypik/products (X-Api-Key) — ERP-ul expune deja endpointul.
 * Ținta:  marketplace_products + erp_product_mapping (idempotent, re-rulabil).
 *
 * Rulare:
 *   ERP_API_URL=https://erp.meistercom.ro ERP_API_KEY=msk_... \
 *   DATABASE_URL=postgresql://... node scripts/import-from-erp.mjs [--limit=500] [--dry-run]
 *
 * Notă: produsele intră cu status 'active' doar dacă au preț > 0 și stoc > 0.
 * Restul intră 'draft' — apar în panoul sellerului, nu în feed.
 */
import { Pool } from "pg";

const args = process.argv.slice(2);
const arg = (n, d) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=")[1] : d;
};
const DRY = args.includes("--dry-run");
const LIMIT = Number(arg("limit", "1000"));
const PAGE_SIZE = 200;

const ERP_URL = process.env.ERP_API_URL || "https://erp.meistercom.ro";
const ERP_KEY = process.env.ERP_API_KEY;
const DB = process.env.DATABASE_URL;

if (!ERP_KEY) { console.error("Lipsește ERP_API_KEY"); process.exit(1); }
if (!DB) { console.error("Lipsește DATABASE_URL"); process.exit(1); }

const pool = new Pool({ connectionString: DB });

/** Mapare grosieră ERP → taxonomia Swypik. Se rafinează ulterior cu AI. */
function mapTaxonomy(title, category) {
  const t = `${title} ${category ?? ""}`.toLowerCase();
  const rules = [
    [/centrala|boiler|calorifer|radiator|teava|tevi|fiting|robinet|baterie sanitar/, "build/plumbing"],
    [/intrerupator|priza|cablu|siguranta|tablou electric|doza|corp iluminat|bec|led/, "build/electrical"],
    [/tabla|tigla|jgheab|burlan|polistiren|vata|adeziv|mortar|ciment|caramida|bca/, "build/materials"],
    [/parchet|gresie|faianta|linoleum|mocheta/, "build/flooring"],
    [/usa|usi|fereastra|ferestre|geam/, "build/doors"],
    [/vopsea|lac|grund|amorsa|diluant/, "build/paint"],
    [/scula|bormasina|polizor|flex|surubelnita|ciocan|dalta|clesti/, "build/tools"],
    [/schela|betoniera|generator|compresor|utilaj/, "build/heavy"],
  ];
  for (const [re, slug] of rules) if (re.test(t)) return slug;
  return "build/materials"; // Meister Com = materiale de construcții
}

function slugify(s, id) {
  const base = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base || "produs"}-${id}`;
}

async function fetchPage(page) {
  const res = await fetch(`${ERP_URL}/api/swypik/products?page=${page}&size=${PAGE_SIZE}`, {
    headers: { "X-Api-Key": ERP_KEY },
  });
  if (!res.ok) throw new Error(`ERP a răspuns ${res.status}`);
  return res.json();
}

async function ensureSeller(client) {
  const { rows } = await client.query(
    `SELECT id FROM sellers WHERE email = 'office@meistercom.ro' OR name ILIKE 'Meister%' LIMIT 1`,
  );
  if (rows[0]) return rows[0].id;
  const ins = await client.query(
    `INSERT INTO sellers (name, email, status, product_type, erp_api_url, erp_connected)
     VALUES ('Meister Com', 'office@meistercom.ro', 'active', 'physical', $1, true)
     RETURNING id`,
    [ERP_URL],
  );
  return ins.rows[0].id;
}

async function main() {
  const client = await pool.connect();
  let imported = 0, updated = 0, skipped = 0, errors = 0;

  try {
    const sellerId = await ensureSeller(client);
    console.log(`seller: ${sellerId}${DRY ? "  [DRY RUN]" : ""}`);

    for (let page = 1; imported + updated + skipped < LIMIT; page++) {
      const data = await fetchPage(page);
      const products = data.products ?? [];
      if (products.length === 0) break;

      for (const p of products) {
        if (imported + updated + skipped >= LIMIT) break;

        // Fără preț nu are ce căuta în marketplace.
        if (!p.price_cents || p.price_cents <= 0) { skipped++; continue; }

        const status = p.inventory_qty > 0 ? "active" : "draft";
        const taxonomy = mapTaxonomy(p.title, p.category);
        const [dept, cat] = taxonomy.split("/");

        if (DRY) {
          if (imported < 5) console.log(`  ${p.title.slice(0, 45)} → ${taxonomy} (${(p.price_cents / 100).toFixed(2)} RON, stoc ${p.inventory_qty})`);
          imported++;
          continue;
        }

        try {
          await client.query("BEGIN");

          const { rows: existing } = await client.query(
            `SELECT marketplace_product_id FROM erp_product_mapping
              WHERE seller_id = $1 AND erp_product_id = $2`,
            [sellerId, p.external_product_id],
          );

          if (existing[0]?.marketplace_product_id) {
            await client.query(
              `UPDATE marketplace_products
                  SET title = $2, price_cents = $3, currency = $4,
                      inventory_status = $5, status = $6, updated_at = now()
                WHERE id = $1`,
              [existing[0].marketplace_product_id, p.title, p.price_cents,
               p.currency || "RON", p.inventory_qty > 0 ? "in_stock" : "out_of_stock", status],
            );
            updated++;
          } else {
            const { rows: ins } = await client.query(
              `INSERT INTO marketplace_products (
                 seller_id, external_product_id, slug, title, category,
                 status, currency, price_cents, inventory_status,
                 source_type, supplier, supplier_product_id,
                 taxonomy_node_slug, taxonomy_department, taxonomy_category,
                 listing_type, location_country, metadata
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'meister_erp','Meister Com',$10,$11,$12,$13,'product','RO',$14::jsonb)
               RETURNING id`,
              [
                sellerId, p.external_product_id, slugify(p.title, p.external_product_id),
                p.title, p.category || null, status, p.currency || "RON", p.price_cents,
                p.inventory_qty > 0 ? "in_stock" : "out_of_stock",
                p.external_product_id, taxonomy, dept, cat,
                JSON.stringify({ sku: p.sku, barcode: p.barcode, unit: p.unit, vat_rate: p.vat_rate, inventory_qty: p.inventory_qty }),
              ],
            );
            await client.query(
              `INSERT INTO erp_product_mapping (seller_id, erp_product_id, erp_sku, marketplace_product_id)
               VALUES ($1,$2,$3,$4)
               ON CONFLICT (seller_id, erp_product_id) DO UPDATE SET marketplace_product_id = EXCLUDED.marketplace_product_id, last_synced_at = now()`,
              [sellerId, p.external_product_id, p.sku, ins[0].id],
            );
            imported++;
          }
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          errors++;
          if (errors <= 3) console.error(`  eroare la "${p.title?.slice(0, 40)}": ${e.message}`);
        }
      }

      process.stdout.write(`\rpagina ${page}: +${imported} noi, ${updated} actualizate, ${skipped} sărite, ${errors} erori`);
      if (products.length < PAGE_SIZE) break;
    }

    console.log(`\n\nGata: ${imported} importate, ${updated} actualizate, ${skipped} fără preț, ${errors} erori`);
    if (!DRY) {
      const { rows } = await client.query(
        `SELECT status, count(1) AS n FROM marketplace_products GROUP BY status`,
      );
      console.log("în catalog:", rows.map((r) => `${r.status}=${r.n}`).join(", "));
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
