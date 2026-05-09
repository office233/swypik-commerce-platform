const { Client } = require('pg');
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

const manualMap = {
  3120601: "Lenjerie Femei",
  200004279: "Pijamale & Lenjerie Noapte",
  201531602: "Seturi Femei",
  201530702: "Rochii de Seară",
  201517401: "Haine Gravide",
  200000413: "Colanți",
  127898002: "Fuste",
  200000841: "Treninguri",
  201706202: "Rochii Casual",
  200001872: "Bluze",
  200001814: "Tricouri",
  201916603: "Jachete",
  200001915: "Hanorace",
  200001870: "Cămăși",
  200000866: "Pantaloni",
  100005788: "Rochii de Mireasă",
  100005791: "Rochii Domnișoare",
  100005792: "Rochii Mamă",
  100005793: "Rochii Flori",
};

async function fix() {
  const c = new Client(NEON_URL);
  await c.connect();

  for (const [id, name] of Object.entries(manualMap)) {
    await c.query('UPDATE ae_categories SET name_ro = $1, name = $1 WHERE ae_category_id = $2', [name, id]);
  }

  // Pentru restul care au rămas cu "Sub", punem "Haine Femei" automat
  await c.query(`UPDATE ae_categories SET name_ro = 'Haine Femei', name = 'Women''s Clothing' WHERE name_ro LIKE 'Sub %'`);

  console.log("Gata! Am scos 'Sub ...' din toate categoriile.");
  await c.end();
}
fix().catch(console.error);
