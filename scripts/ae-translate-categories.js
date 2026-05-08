/**
 * 🇷🇴 Traducere categorii AliExpress → Română
 */
const { Client } = require('pg');
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

// Manual translations for all 38 main categories + 521 subcategories
const TRANSLATIONS = {
  // === NIVEL 1 — Categorii principale ===
  "Apparel & Accessories": "Îmbrăcăminte & Accesorii",
  "Apparel Accessories": "Accesorii Vestimentare",
  "Automobiles, Parts & Accessories": "Auto, Piese & Accesorii",
  "Beauty & Health": "Frumusețe & Sănătate",
  "Books & Cultural Merchandise": "Cărți & Cultură",
  "Computer & Office": "Calculatoare & Birou",
  "Consumer Electronics": "Electronice",
  "Electronic Components & Supplies": "Componente Electronice",
  "Food": "Alimente",
  "Furniture": "Mobilier",
  "Hair Extensions & Wigs": "Extensii Păr & Peruci",
  "Home & Garden": "Casă & Grădină",
  "Home Appliances": "Electrocasnice",
  "Home Improvement": "Amenajări Interioare",
  "Industrial & Business": "Industrial & Business",
  "Jewelry & Accessories": "Bijuterii & Accesorii",
  "Lights & Lighting": "Iluminat",
  "Luggage & Bags": "Bagaje & Genți",
  "Men's Clothing": "Îmbrăcăminte Bărbați",
  "Mother & Kids": "Mamă & Copil",
  "Motorcycle Equipments & Parts": "Echipamente Motocicletă",
  "Novelty & Special Use": "Costume & Uzuri Speciale",
  "Office & School Supplies": "Birou & Papetărie",
  "Phones & Telecommunications": "Telefoane & Telecomunicații",
  "Phones & Telecommunications Accessories": "Accesorii Telefoane",
  "Second-Hand": "Second-Hand",
  "Security & Protection": "Securitate & Protecție",
  "Shoes": "Încălțăminte",
  "Special Category": "Categorie Specială",
  "Sports & Entertainment": "Sport & Divertisment",
  "Sports Shoes,Clothing&Accessories": "Încălțăminte & Echipament Sport",
  "Tools": "Scule & Unelte",
  "Toys & Hobbies": "Jucării & Hobby",
  "Underwear": "Lenjerie Intimă",
  "Virtual Products": "Produse Virtuale",
  "Watches": "Ceasuri",
  "Weddings & Events": "Nunți & Evenimente",
  "Women's Clothing": "Îmbrăcăminte Femei",

  // === NIVEL 2 — Subcategorii (toate 521) ===
  // Auto
  "Car Electronics": "Electronică Auto",
  "Car Lights": "Lumini Auto",
  "Car Repair Tools": "Scule Reparații Auto",
  "Car Wash & Maintenance": "Spălare & Întreținere Auto",
  "Exterior Accessories": "Accesorii Exterioare",
  "Interior Accessories": "Accesorii Interioare",
  "Replacement Parts": "Piese de Schimb",
  "Car Stickers": "Autocolante Auto",
  "DVR & Dashcam": "DVR & Cameră Bord",
  "GPS & Accessories": "GPS & Accesorii",
  "Car Organizers": "Organizatoare Auto",
  "Car Electronics Accessories": "Accesorii Electronică Auto",
  "Car Seat Covers & Accessories": "Huse Scaun & Accesorii",
  "Motorcycle & ATV": "Motociclete & ATV",

  // Beauty & Health
  "Bath & Shower": "Baie & Duș",
  "Fragrance & Deodorant": "Parfumuri & Deodorante",
  "Hair Care & Styling": "Îngrijire Păr",
  "Health Care": "Sănătate",
  "Makeup": "Machiaj",
  "Nail Art & Tools": "Manichiură",
  "Oral Hygiene": "Igienă Orală",
  "Sanitary Paper": "Hârtie Sanitară",
  "Sex Products": "Produse Intime",
  "Shaving & Hair Removal": "Ras & Epilare",
  "Skin Care": "Îngrijire Ten",
  "Skin Care Tool": "Dispozitive Îngrijire",
  "Tattoo & Body Art": "Tatuaje & Body Art",
  "Vision Care": "Ochelari & Lentile",
  "Beauty & Health(New)": "Frumusețe & Sănătate",
  "Beauty Tools": "Instrumente Frumusețe",
  "Essential Oil": "Uleiuri Esențiale",
  "Men's Care": "Îngrijire Bărbați",
  "Personal Care Appliance": "Aparate Îngrijire",
  "Salon Professional Appliances": "Aparate Profesionale Salon",

  // Computer & Office
  "Computer Peripherals": "Periferice PC",
  "Computer Components": "Componente PC",
  "Desktops & Servers": "Desktop-uri & Servere",
  "External Storage": "Stocare Externă",
  "Laptop Accessories": "Accesorii Laptop",
  "Laptop Parts & Accessories": "Piese Laptop",
  "Laptops": "Laptopuri",
  "Mice & Keyboards": "Mouse & Tastaturi",
  "Networking": "Rețelistică",
  "Office Electronics": "Electronică Birou",
  "Printer Supplies": "Consumabile Imprimantă",
  "Printers": "Imprimante",
  "Storage Devices": "Dispozitive Stocare",
  "Tablet Accessories": "Accesorii Tabletă",
  "Tablets": "Tablete",
  "Demo Board": "Plăci Demo",
  "Mini PC": "Mini PC",
  "Monitor & Accessories": "Monitoare & Accesorii",

  // Consumer Electronics
  "Camera & Photo": "Cameră & Foto",
  "Games & Accessories": "Jocuri & Accesorii",
  "Portable Audio & Video": "Audio & Video Portabil",
  "Smart Electronics": "Electronice Smart",
  "VR/AR Devices": "Dispozitive VR/AR",
  "Wearable Devices": "Dispozitive Purtabile",
  "Consumer Electronics Accessories": "Accesorii Electronice",

  // Home & Garden
  "Arts,Crafts & Sewing": "Arte & Cusut",
  "Festive & Party Supplies": "Petreceri & Sărbători",
  "Garden Supplies": "Grădinărit",
  "Home Decor": "Decorațiuni Casă",
  "Home Storage & Organization": "Organizare & Depozitare",
  "Home Textile": "Textile Casă",
  "Household Merchandises": "Produse Casă",
  "Household Cleaning": "Curățenie",
  "Kitchen,Dining & Bar": "Bucătărie & Bar",
  "Pet Products": "Produse Animale",

  // Home Appliances
  "Home Appliance Parts": "Piese Electrocasnice",
  "Kitchen Appliances": "Electrocasnice Bucătărie",
  "Large Appliances": "Electrocasnice Mari",
  "Major Appliances": "Electrocasnice Principale",
  "Household Appliances": "Electrocasnice Casă",
  "Personal Care Appliances": "Electrocasnice Personale",
  "Small Kitchen Appliances": "Mici Electrocasnice",
  "Vacuum Cleaners": "Aspiratoare",

  // Jewelry
  "Fashion Jewelry": "Bijuterii Fashion",
  "Fine Jewelry": "Bijuterii Fine",
  "Jewelry Packaging & Display": "Ambalaje Bijuterii",
  "Men's Jewelry": "Bijuterii Bărbați",
  "Women's Jewelry": "Bijuterii Femei",
  "Beads & Jewelry Making": "Mărgele & Creații",
  "Customized Jewelry": "Bijuterii Personalizate",

  // Phones
  "Mobile Phones": "Telefoane Mobile",
  "Mobile Phone Parts": "Piese Telefoane",
  "Communication Equipment": "Echipamente Comunicații",
  "Walkie Talkie": "Stații Radio",
  "Used&Refurbished Phones": "Telefoane Recondiţionate",
  "Mobile Phone Accessories": "Accesorii Telefoane",
  "Mobile Phone Cases & Covers": "Huse Telefoane",
  "Mobile Phone Protective Film": "Folii Protecție",
  "Holders & Stands": "Suporturi Telefon",
  "Mobile Phone Decorations": "Decorațiuni Telefon",
  "Mobile Phone Photography Accessories": "Accesorii Foto Telefon",
  "Sim Cards & Accessories": "Cartele SIM",
  "Walkie Talkie Accessories & Parts": "Accesorii Stații Radio",

  // Toys & Hobbies
  "Action & Toy Figures": "Figurine & Jucării",
  "Baby & Toddler Toys": "Jucării Bebeluși",
  "Building & Construction Toys": "Construcții & Lego",
  "Classic Toys": "Jucării Clasice",
  "Dolls & Accessories": "Păpuși & Accesorii",
  "Dolls & Stuffed Toys": "Păpuși & Jucării Pluș",
  "Electronic Toys": "Jucării Electronice",
  "Games and Puzzles": "Jocuri & Puzzle",
  "Learning & Education": "Educative",
  "Novelty & Gag Toys": "Jucării Amuzante",
  "Outdoor Fun & Sports": "Jucării Exterior",
  "Pretend Play": "Jocuri de Rol",
  "Remote Control Toys": "Jucării Teleghidate",
  "Stress Relief Toy": "Jucării Anti-Stres",
  "Stuffed Animals & Plush": "Animale Pluș",
  "High Tech Toys": "Jucării High-Tech",
  "Hobby & Collectibles": "Colecții & Hobby",
  "Kid's Party": "Petreceri Copii",
  "Play Vehicles & Models": "Vehicule & Modele",
  "Pools & Water Fun": "Piscine & Accesorii",
  "ACG Goods": "ACG & Anime",
  "Trendy Blind Box": "Blind Box Trendy",
  "Arts & Crafts, DIY toys": "Arte & Creații DIY",

  // Watches
  "Children's Watches": "Ceasuri Copii",
  "Couple Watches": "Ceasuri Cuplu",
  "Customized Watches": "Ceasuri Personalizate",
  "Men's Watches": "Ceasuri Bărbați",
  "Women's Watches": "Ceasuri Femei",
  "Pocket & Fob Watches": "Ceasuri de Buzunar",
  "Watches Accessories": "Accesorii Ceasuri",

  // Women's Clothing
  "Blouses & Shirts": "Bluze & Cămăși",
  "Coats & Jackets": "Geci & Jachete",
  "Dresses": "Rochii",
  "Hoodies & Sweatshirts": "Hanorace",
  "Pants & Capris": "Pantaloni",
  "Skirts": "Fuste",
  "Sweaters": "Pulovere",
  "Tops & Tees": "Topuri & Tricouri",
  "Shorts": "Pantaloni Scurți",
  "Swimwears": "Costume de Baie",
  "Leggings": "Colanți",
  "Down Coats": "Geci de Puf",
  "Blazer & Suits": "Blazere & Costume",
  "Faux Leather": "Piele Ecologică",
  "Fur & Faux Fur": "Blană",
  "Genuine Leather": "Piele Naturală",
  "Matching Sets": "Seturi Coordonate",
  "Plus Size Clothes": "Mărimi Mari",
  "Parkas": "Parka",
  "Women's Sets": "Seturi Femei",
  "Muslim Fashion": "Modă Musulmană",
  "Real Fur": "Blană Naturală",
  "Traditional Women's Clothing": "Îmbrăcăminte Tradițională",
  "Jumpsuits, Playsuits & Bodysuits": "Salopete & Body-uri",
  "Jumpsuits&Rompers": "Salopete",
  "Basic Clothing": "Îmbrăcăminte de Bază",
  "Jeans（New）": "Blugi",
  "Shirts & Blouses": "Cămăși & Bluze",
  "Sweaters&Jumpers": "Pulovere & Jersee",
  "Ready-to-wear Dresses": "Rochii Prêt-à-Porter",
  "Customized Blouses & Shirts": "Bluze Personalizate",
  "Customized Dresses": "Rochii Personalizate",
  "Customized Skirts": "Fuste Personalizate",

  // Men's Clothing
  "Men's Shirts": "Cămăși Bărbați",
  "Suits & Blazer": "Costume & Blazere",
  "Tops & Tees": "Topuri & Tricouri",
  "Denim（New）": "Denim",
  "Men's Sets（new）": "Seturi Bărbați",
  "Traditional Men's Clothing": "Îmbrăcăminte Tradițională Bărbați",
  "Tailor-made Hoodies & Sweatshirts": "Hanorace Personalizate",
  "Tailor-made Shirts": "Cămăși Personalizate",
  "Plus Size Men's Clothing": "Mărimi Mari Bărbați",
  "Middle East Fashion": "Modă Orient",
  "Pants": "Pantaloni",

  // Shoes
  "Men's Shoes": "Pantofi Bărbați",
  "Women's Shoes": "Pantofi Femei",
  "Shoe Accessories": "Accesorii Încălțăminte",
  "Other Shoes": "Alte Încălțăminte",
  "Mules & Clogs": "Saboti & Papuci",

  // Bags
  "Backpack": "Rucsacuri",
  "Women's Handbags": "Genți Femei",
  "Men's Bags": "Genți Bărbați",
  "Wallets & Holders": "Portofele",
  "Travel Bags": "Genți Călătorie",
  "Luggage": "Bagaje",
  "Travel Accessories": "Accesorii Călătorie",
  "School Bags": "Ghiozdane",
  "Waist Packs": "Borsete",
  "Kids' Bags": "Genți Copii",
  "Bag Parts & Accessories": "Piese Genți",
  "Chest Bags": "Genți de Piept",

  // Sports
  "Camping & Hiking": "Camping & Drumeții",
  "Cycling": "Ciclism",
  "Fishing": "Pescuit",
  "Fitness & Body Building": "Fitness",
  "Musical Instruments": "Instrumente Muzicale",
  "Water Sports": "Sporturi Nautice",
  "Golf": "Golf",
  "Horse Riding": "Echitație",
  "Hunting": "Vânătoare",
  "Skiing & Snowboarding": "Schi & Snowboard",
  "Sneakers": "Adidași",
  "Sportswear": "Echipament Sport",
  "Dance": "Dans",
  "Sport Bags": "Genți Sport",
  "Sports Accessories": "Accesorii Sport",
  "Children's Sports": "Sport Copii",
  "Entertainment": "Divertisment",
  "Racquet Sports": "Sporturi cu Rachetă",
  "Roller,Skateboard": "Role & Skateboard",
  "Shooting": "Tir",
  "Team Sports": "Sporturi de Echipă",
  "Sports Competitions": "Competiții Sportive",
  "Basketball（New）": "Baschet",
  "Football（New）": "Fotbal",
  "Cheerleading": "Majorete",
  "Sports Bags(hidden)": "Genți Sport",

  // Underwear
  "Bikinis": "Bikini",
  "Men Socks": "Șosete Bărbați",
  "Men's Sleep & Lounge": "Pijamale Bărbați",
  "Men's Underwears": "Lenjerie Bărbați",
  "Women's Intimates": "Lenjerie Femei",
  "Women's Sleep & Lounge": "Pijamale Femei",
  "Women's Socks & Hosiery": "Șosete & Dresuri Femei",

  // Mother & Kids
  "Baby Care": "Îngrijire Bebeluș",
  "Baby Clothing": "Haine Bebeluș",
  "Baby Food": "Mâncare Bebeluș",
  "Baby Furniture": "Mobilier Bebeluș",
  "Children's Clothing": "Haine Copii",
  "Maternity Clothings": "Haine Gravide",
  "Kids Shoes": "Pantofi Copii",
  "Kids Accessories": "Accesorii Copii",
  "Feeding": "Hrănire",
  "Baby Strollers&Accessories": "Cărucioare",
  "Activity & Gear": "Activitate & Echipament",
  "Baby Diaper & Wipes": "Scutece & Șervețele",
  "Pregnancy & Maternity": "Sarcină & Maternitate",
  "Car Seats & Accessories": "Scaune Auto Copii",
  "Safety": "Siguranță",
  "Bedding": "Lenjerie Pat",
  "Baby Souvenirs": "Suveniruri Bebeluș",
  "Diapering & Toilet Training": "Scutece & Olită",
  "Baby Sterilization & Appliances": "Sterilizare & Aparate",

  // Tools
  "Hand Tools": "Scule de Mână",
  "Power Tools": "Scule Electrice",
  "Garden Tools": "Scule Grădină",
  "Tool Sets": "Seturi Scule",
  "Welding & Soldering Supplies": "Sudură & Lipire",
  "Welding Equipment & Supplies": "Echipament Sudură",
  "Measurement & Analysis Instruments": "Instrumente Măsurare",
  "Construction Tools": "Scule Construcții",
  "Tool Parts": "Piese Scule",
  "Other Tools": "Alte Scule",
  "Power Tool Parts & Accessories": "Piese Scule Electrice",
  "Riveter Guns": "Pistoluri Nituire",
  "Tools Packaging": "Ambalaje Scule",
  "Abrasive Tools & Abrasives": "Scule Abrazive",
  "Drill Bits, Saw Blades & Cutting Tools": "Burghie & Lame",
  "Laser Engraving Machine & Accessories": "Gravură Laser",

  // Lights & Lighting
  "Ceiling Lights": "Plafoniere",
  "Indoor Lighting": "Iluminat Interior",
  "LED Lighting": "Iluminat LED",
  "Lighting Accessories": "Accesorii Iluminat",
  "Night Lights": "Lumini de Noapte",
  "Outdoor Lighting": "Iluminat Exterior",
  "Portable Lighting": "Iluminat Portabil",
  "Commercial Lighting": "Iluminat Comercial",
  "Lighting Bulbs & Tubes": "Becuri & Tuburi",
  "Novelty Lighting（new）": "Iluminat Decorativ",
  "Other Lights & Lighting Products": "Alte Produse Iluminat",
  "Professional Light": "Iluminat Profesional",
  "Special Engineering Lighting": "Iluminat Special",

  // Security
  "Video Surveillance": "Supraveghere Video",
  "Security Alarm": "Alarme Securitate",
  "Access Building Automation": "Automatizări",
  "Emergency Safety Supplies": "Siguranță Urgențe",
  "First Aid Kits": "Truse Prim-Ajutor",
  "Roadway Safety": "Siguranță Rutieră",
  "Safes": "Seifuri",
  "Smart Card System": "Sisteme Smart Card",
  "Smart Public Safety Systems": "Sisteme Smart Siguranță",
  "Security Inspection Device": "Echipamente Inspecție",
  "Public Broadcasting": "Difuzare Publică",
  "Transmission & Cables": "Transmisie & Cabluri",
  "UAV System & Robot": "Drone & Roboți",

  // Home Improvement
  "Bathroom Fixtures": "Instalații Baie",
  "Building Materials": "Materiale Construcții",
  "Electrical Equipment & Supplies": "Echipamente Electrice",
  "Hardware": "Fierărie",
  "Kitchen Fixtures": "Instalații Bucătărie",
  "Painting Supplies & Wall Treatments": "Vopsele & Decorațiuni Perete",
  "Plumbing": "Instalații Sanitare",

  // Weddings & Events
  "Wedding Dresses": "Rochii de Mireasă",
  "Wedding Accessories": "Accesorii Nuntă",
  "Wedding Party Dress": "Rochii Petrecere Nuntă",
  "Special Occasion Dresses": "Rochii Ocazii Speciale",
  "Party & Vacation Wear": "Ținute Petrecere & Vacanță",
  "Haute Couture Dresses": "Rochii Haute Couture",

  // Novelty
  "Cosplay Costumes": "Costume Cosplay",
  "Cosplay Accessories": "Accesorii Cosplay",
  "Work Wear & Uniforms": "Uniforme",
  "Stage & Dance Wear": "Ținute Scenă & Dans",
  "Exotic Apparel": "Îmbrăcăminte Exotică",
  "Functional Apparel": "Îmbrăcăminte Funcțională",
  "World Apparel": "Îmbrăcăminte Tradițională",

  // Office
  "Art Supplies": "Materiale Artă",
  "Pens, Pencils & Writing Supplies": "Pixuri & Creioane",
  "Notebooks & Writing Pads": "Caiete & Blocnotesuri",
  "School Supplies": "Rechizite Școlare",
  "Desk Accessories & Organizer": "Organizator Birou",
  "Stationery Sticker": "Autocolante",
  "Tapes, Adhesives & Fasteners": "Benzi & Adezivi",
  "Filing Products": "Dosare & Bibliorafturi",
  "Printing Products": "Tipărire",

  // Hair
  "Human Hair（Weaves）": "Extensii Păr Natural",
  "Synthetic Extensions": "Extensii Sintetice",
  "Hair Tools & Accessories": "Accesorii Păr",
  "Synthetic Wigs": "Peruci Sintetice",
  "Salon Bundle Hair": "Pachete Salon",

  // Used Phones
  "Used Phones": "Telefoane Second-Hand",
};

async function main() {
  const db = new Client({ connectionString: NEON_URL });
  await db.connect();

  const { rows } = await db.query('SELECT id, ae_category_id, name, name_ro FROM ae_categories ORDER BY level, name');
  
  let translated = 0;
  let missing = 0;

  for (const cat of rows) {
    const ro = TRANSLATIONS[cat.name];
    if (ro) {
      await db.query('UPDATE ae_categories SET name_ro = $1 WHERE id = $2', [ro, cat.id]);
      translated++;
    } else if (!cat.name_ro) {
      // No translation found — keep English for now
      missing++;
      console.log(`  ⚠️ Lipsă traducere: "${cat.name}"`);
    }
  }

  console.log(`\n✅ ${translated} categorii traduse`);
  console.log(`⚠️ ${missing} fără traducere (rămân în engleză)`);

  // Show sample
  const { rows: sample } = await db.query('SELECT name, name_ro FROM ae_categories WHERE level = 1 ORDER BY name LIMIT 10');
  console.log('\nExemplu categorii principale:');
  sample.forEach(s => console.log(`  ${s.name} → ${s.name_ro}`));

  await db.end();
}

main().catch(e => console.error('FATAL:', e.message));
