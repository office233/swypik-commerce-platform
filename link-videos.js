const { Pool } = require('@neondatabase/serverless');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require'
});

async function linkVideos() {
  console.log('🔍 Căutăm produse care au potențial video...');
  
  // Găsim toate produsele care ar trebui să aibă video dar nu sunt mapate pe CDN-ul nostru încă
  const res = await pool.query(`
    SELECT id, ae_product_id 
    FROM ae_products 
    WHERE has_video = true 
      AND (video_url IS NULL OR video_url NOT LIKE '%cdn.aicevrei.ro%')
  `);
  
  const products = res.rows;
  console.log(`⏳ Am găsit ${products.length} produse nemapate. Verificăm R2 CDN...`);

  let linkedCount = 0;
  
  // Procesăm în calupuri de câte 20 simultan pentru viteză
  const BATCH_SIZE = 20;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (p) => {
      const url = `https://cdn.aicevrei.ro/clips/${p.ae_product_id}.mp4`;
      try {
        const check = await fetch(url, { method: 'HEAD' });
        
        if (check.status === 200) {
          // Clipul există pe CDN! Facem update în baza de date.
          await pool.query(
            `UPDATE ae_products SET video_url = $1 WHERE id = $2`,
            [url, p.id]
          );
          linkedCount++;
          console.log(`✅ Activat: ${url}`);
        }
      } catch (err) {
        // Eroare de rețea, ignorăm
      }
    }));
  }

  console.log(`\n🎉 GATA! Au fost găsite și conectate ${linkedCount} videoclipuri noi.`);
  console.log(`Acestea au intrat deja automat în Feed-ul aplicației!`);
  process.exit(0);
}

linkVideos().catch(console.error);
