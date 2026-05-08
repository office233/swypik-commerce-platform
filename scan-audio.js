// Scan all video products and detect which ones have audio tracks
// Checks the MP4 header for 'mp4a' or 'soun' markers
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require'
});

async function checkAudio(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    const res = await fetch(url, {
      headers: { 'Range': 'bytes=0-800000' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    const buf = new Uint8Array(await res.arrayBuffer());
    const str = new TextDecoder('latin1').decode(buf);
    return str.includes('mp4a') || str.includes('soun') || str.includes('SoundHandler');
  } catch (e) {
    return false;
  }
}

async function main() {
  // First, add has_audio column if not exists
  await pool.query(`ALTER TABLE ae_products ADD COLUMN IF NOT EXISTS has_audio BOOLEAN DEFAULT false`);
  console.log('Column has_audio ready');

  // Get all video products
  const { rows } = await pool.query(
    `SELECT id, video_url FROM ae_products WHERE has_video = true AND video_url IS NOT NULL ORDER BY orders_count DESC NULLS LAST`
  );
  console.log(`Scanning ${rows.length} videos for audio tracks...`);

  let withAudio = 0;
  let withoutAudio = 0;
  let errors = 0;
  const BATCH = 20; // concurrent checks

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (row) => {
        const hasAudio = await checkAudio(row.video_url);
        return { id: row.id, hasAudio };
      })
    );

    // Update DB in batch
    for (const { id, hasAudio } of results) {
      await pool.query('UPDATE ae_products SET has_audio = $1 WHERE id = $2', [hasAudio, id]);
      if (hasAudio) withAudio++;
      else withoutAudio++;
    }

    const pct = Math.round(((i + batch.length) / rows.length) * 100);
    process.stdout.write(`\r  Progress: ${i + batch.length}/${rows.length} (${pct}%) | Audio: ${withAudio} | Silent: ${withoutAudio}`);
  }

  console.log(`\n\nDone! Audio: ${withAudio} | Silent: ${withoutAudio} | Errors: ${errors}`);
  await pool.end();
}

main().catch(console.error);
