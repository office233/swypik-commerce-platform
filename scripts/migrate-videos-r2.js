/**
 * Migrate AliExpress video clips to Cloudflare R2
 * Downloads from AliExpress CDN → Uploads to R2 → Updates database
 */

const { S3Client, PutObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { Pool } = require("pg");

// ─── Cloudflare R2 Configuration ───
const R2_ACCOUNT_ID = "170a402eb0e52749e1d5cf511e8cb518";
const R2_ACCESS_KEY = "63eea316a7baa6b803c5f1878f21e6db";
const R2_SECRET_KEY = "e173dc6a44707b7ef746110a39c736eea09bf05b9aa7714560f52484ef2e3aa2";
const R2_BUCKET = "aicevrei-videos";
const R2_PUBLIC_URL = "https://cdn.aicevrei.ro";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
});

// ─── Database ───
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://aicevrei_products_owner:npg_cPvb7VBX1wOk@ep-misty-fog-a2ilxisf-pooler.eu-central-1.aws.neon.tech/aicevrei_products_dser?sslmode=require",
});

async function checkExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function downloadVideo(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    clearTimeout(timeout);
    return buffer;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function uploadToR2(key, buffer) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: "video/mp4",
    CacheControl: "public, max-age=31536000", // 1 year cache
  }));
}

async function main() {
  console.log("🚀 Starting video migration to Cloudflare R2...\n");

  // Get all products with video URLs
  const { rows } = await pool.query(`
    SELECT id, ae_product_id, video_url 
    FROM ae_products 
    WHERE has_video = true AND has_audio = true AND video_url IS NOT NULL AND video_url != ''
    ORDER BY orders_count DESC NULLS LAST
  `);

  console.log(`📦 Found ${rows.length} videos to migrate\n`);

  let migrated = 0, skipped = 0, failed = 0;
  const errors = [];
  const BATCH_SIZE = 5; // Download 5 at a time

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (row) => {
      const key = `clips/${row.ae_product_id}.mp4`;
      const newUrl = `${R2_PUBLIC_URL}/${key}`;
      
      try {
        // Skip if already uploaded
        if (await checkExists(key)) {
          // Just update DB URL if needed
          await pool.query("UPDATE ae_products SET video_url = $1 WHERE id = $2", [newUrl, row.id]);
          skipped++;
          process.stdout.write(`⏭ `);
          return;
        }

        // Download from AliExpress
        const buffer = await downloadVideo(row.video_url);
        const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);

        // Upload to R2
        await uploadToR2(key, buffer);

        // Update database with new URL
        await pool.query("UPDATE ae_products SET video_url = $1 WHERE id = $2", [newUrl, row.id]);

        migrated++;
        process.stdout.write(`✅ `);
        
        if (migrated % 50 === 0) {
          console.log(`\n📊 Progress: ${migrated + skipped + failed}/${rows.length} (${migrated} migrated, ${skipped} skipped, ${failed} failed)`);
        }
      } catch (err) {
        failed++;
        errors.push({ id: row.id, url: row.video_url, error: err.message });
        process.stdout.write(`❌ `);
      }
    }));
  }

  console.log(`\n\n${"=".repeat(50)}`);
  console.log(`✅ Migration complete!`);
  console.log(`   Migrated: ${migrated}`);
  console.log(`   Skipped (already on R2): ${skipped}`);
  console.log(`   Failed: ${failed}`);
  console.log(`${"=".repeat(50)}\n`);

  if (errors.length > 0) {
    console.log("❌ Failed videos:");
    errors.slice(0, 20).forEach(e => console.log(`   ID ${e.id}: ${e.error}`));
  }

  // Verify
  const { rows: check } = await pool.query(`
    SELECT COUNT(*) as total, 
           COUNT(CASE WHEN video_url LIKE '%cdn.aicevrei.ro%' THEN 1 END) as on_r2
    FROM ae_products WHERE has_video = true AND has_audio = true
  `);
  console.log(`\n📊 Verification: ${check[0].on_r2}/${check[0].total} videos now on R2`);

  await pool.end();
}

main().catch(console.error);
