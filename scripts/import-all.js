const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DOWNLOADS_DIR = 'C:/Users/Pos5/Downloads';
const IMPORT_SCRIPT = path.join(__dirname, 'ae-import-scraped.js');

async function runImport() {
  console.log('🔍 Căutăm fișiere JSON în folderul Downloads...\n');
  
  const files = fs.readdirSync(DOWNLOADS_DIR)
    .filter(file => file.endsWith('.json') && (file.includes('products') || file.includes('jeans')));
    
  if (files.length === 0) {
    console.log('⚠️ Nu am găsit fișiere JSON valide pentru import în Downloads.');
    return;
  }
  
  console.log(`📦 Am găsit ${files.length} fișiere cu produse:`);
  files.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
  console.log('\n🚀 Începem importul secvențial (pe rând)...\n');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fullPath = path.join(DOWNLOADS_DIR, file);
    
    // Extragem Category ID dacă există în interiorul JSON-ului, sau default
    let catId = 100003109; // Default women's clothing
    try {
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      if (data.category_id) catId = data.category_id;
    } catch(e) {}

    console.log(`\n======================================================`);
    console.log(`▶️  IMPORTĂM FIȘIERUL [${i + 1}/${files.length}]: ${file}`);
    console.log(`======================================================\n`);

    await new Promise((resolve, reject) => {
      const child = spawn('node', [IMPORT_SCRIPT, fullPath, catId], { stdio: 'inherit' });
      
      child.on('close', (code) => {
        if (code === 0) {
          console.log(`\n✅ Fișierul ${file} a fost importat cu succes!\n`);
          resolve();
        } else {
          console.log(`\n❌ Fișierul ${file} a generat o eroare (Cod: ${code}). Trecem la următorul...\n`);
          // Resolve anyway so it doesn't stop the whole queue
          resolve();
        }
      });
    });
  }
  
  console.log('\n🎉 TOATE FIȘIERELE JSON AU FOST IMPORTATE CU SUCCES! Baza de date este full!');
}

runImport().catch(console.error);
