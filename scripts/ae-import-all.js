/**
 * AICeVrei — Import ALL scraped JSON files sequentially
 * Processes each file one by one, skipping already-imported products
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DOWNLOADS = 'C:/Users/Pos5/Downloads';
const IMPORT_SCRIPT = path.join(__dirname, 'ae-import-scraped.js');
const REFRESH_SCRIPT = path.join(__dirname, 'auto-refresh-token.js');

// All files in order (smallest first = fastest categories first)
const FILES = [
  'aicevrei_1160_products_matchingsets.json',
  'aicevrei_1174_products_tankscamis.json',
  'aicevrei_1745_products_pantstousers.json',
  'aicevrei_2246_products_lenjerie_femei!.json',
  'aicevrei_2933_products_bikinitankinis.json',
  'aicevrei_3158_products_weedingparty.json',
  'aicevrei_3192_products_pajamas_robes.json',
  'aicevrei_3385_products.json',
  'aicevrei_3451_products_formalevening.json',
  // blouseskirt already imported (2497) - skip
];

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  AICeVrei — BULK SEQUENTIAL IMPORT');
  console.log(`  ${FILES.length} files | ~22,444 product IDs`);
  console.log('═══════════════════════════════════════════════\n');

  console.log('🔄 Verificăm și reînnoim sesiunea (Access Token)...');
  try {
    execSync(`"C:\\Program Files\\nodejs\\node.exe" "${REFRESH_SCRIPT}"`, { stdio: 'inherit' });
  } catch (e) {
    console.log('⚠️ Reînnoirea a eșuat, dar încercăm să folosim token-ul curent.');
  }
  console.log('');

  let processed = 0;
  let totalImported = 0;
  let totalSkipped = 0;
  const startTime = Date.now();

  for (let i = 0; i < FILES.length; i++) {
    const file = FILES[i];
    const filePath = path.join(DOWNLOADS, file);

    if (!fs.existsSync(filePath)) {
      console.log(`\n⚠️  [${i + 1}/${FILES.length}] SKIP — file not found: ${file}`);
      continue;
    }

    // Read file to get product count
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const count = data.product_ids?.length || 0;

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`📦 [${i + 1}/${FILES.length}] ${file}`);
    console.log(`   ${count} product IDs | Category: ${data.category_name || 'unknown'}`);
    console.log(`${'═'.repeat(50)}`);

    try {
      // Run the import script for this file
      execSync(`"C:\\Program Files\\nodejs\\node.exe" "${IMPORT_SCRIPT}" "${filePath}"`, {
        cwd: path.dirname(IMPORT_SCRIPT),
        stdio: 'inherit',
        timeout: 4 * 60 * 60 * 1000, // 4 hour timeout per file
      });
      totalImported += count;
      console.log(`\n✅ DONE: ${file} — ${count} products processed`);
    } catch (err) {
      console.log(`\n❌ ERROR on ${file}: ${err.message}`);
      // Continue with next file even on error
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`⏱️  Total elapsed: ${elapsed} min | Processed files: ${i + 1}/${FILES.length}`);
  }

  const totalMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log('\n═══════════════════════════════════════════════');
  console.log(`  ✅ ALL DONE — ${FILES.length} files processed`);
  console.log(`  ⏱️  Total time: ${totalMin} minutes`);
  console.log('═══════════════════════════════════════════════');
}

main();
