"""
Test rapid - scrapuim doar 2 categorii ca sa verificam ca merge
"""
import psycopg2
import re
import time
import sys

DB_CONFIG = {
    'host': 'localhost',
    'user': 'postgres', 
    'password': 'postgres',
    'dbname': 'aicevrei_products_dser'
}

from scrapling.fetchers import StealthyFetcher

def extract_aliexpress_id(url):
    match = re.search(r'/item/(\d+)', url)
    return match.group(1) if match else None

def extract_price(text):
    if not text:
        return None
    match = re.search(r'[\d]+[.,]?\d*', text.replace(',', '.'))
    if match:
        try:
            return float(match.group())
        except:
            return None
    return None

def scrape_and_save(query):
    url = f"https://www.aliexpress.com/w/wholesale-{query}.html"
    print(f"\n  [FETCH] {url}")
    
    start = time.time()
    page = StealthyFetcher.fetch(url, headless=True, network_idle=True)
    print(f"  [OK] Fetch: {time.time()-start:.1f}s")
    
    # Gasim produse
    product_links = page.css('a[href*="/item/"]')
    print(f"  [INFO] {len(product_links)} link-uri gasite")
    
    products = []
    seen = set()
    
    for link_el in product_links:
        href = link_el.attrib.get('href', '')
        ae_id = extract_aliexpress_id(href)
        if not ae_id or ae_id in seen:
            continue
        seen.add(ae_id)
        
        # URL curat
        if href.startswith('//'):
            full_url = 'https:' + href
        elif href.startswith('/'):
            full_url = 'https://www.aliexpress.com' + href
        else:
            full_url = href
        clean_url = full_url.split('?')[0]
        
        # Cautam date in parinti
        title = None
        price = None
        image = None
        
        el = link_el
        for _ in range(6):
            if el is None:
                break
            if not title:
                t = el.css('[class*="title"]::text, [class*="Title"]::text, [class*="name"]::text, h1::text, h2::text, h3::text')
                if t:
                    title = t.get()
            if not price:
                p = el.css('[class*="price"]::text, [class*="Price"]::text')
                if p:
                    price = extract_price(p.get())
            if not image:
                imgs = el.css('img')
                if imgs:
                    for img in imgs:
                        src = img.attrib.get('src', '') or img.attrib.get('data-src', '')
                        if src and ('alicdn' in src or 'aliexpress' in src):
                            image = ('https:' + src) if src.startswith('//') else src
                            break
            try:
                el = el.parent
            except:
                break
        
        if title and len(title.strip()) > 5:
            products.append({
                'aliexpress_id': ae_id,
                'url': clean_url,
                'title': title.strip()[:500],
                'price': price,
                'image': image,
                'category': query.replace('-', ' ').title()
            })
    
    print(f"  [OK] {len(products)} produse cu titlu extras")
    
    # Salvam in DB
    if not products:
        return 0, 0
    
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    ins = upd = 0
    
    for p in products:
        try:
            cur.execute("SELECT id FROM products WHERE aliexpress_id = %s", (p['aliexpress_id'],))
            if cur.fetchone():
                cur.execute("""UPDATE products SET price_usd=COALESCE(%s,price_usd), 
                    main_image=COALESCE(%s,main_image), updated_at=NOW() 
                    WHERE aliexpress_id=%s""",
                    (p['price'], p['image'], p['aliexpress_id']))
                upd += 1
            else:
                cur.execute("""INSERT INTO products 
                    (aliexpress_id, aliexpress_url, title, category_name, price_usd, main_image,
                     detail_fetched, variants_fetched, pushed_to_shopify, is_expired, 
                     is_fake_quantity, is_incomplete, created_at, updated_at)
                    VALUES (%s,%s,%s,%s,%s,%s,false,false,false,false,false,false,NOW(),NOW())""",
                    (p['aliexpress_id'], p['url'], p['title'], p['category'], 
                     p['price'] if p['price'] else 0.00, p['image']))
                ins += 1
            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"  [WARN] {p['aliexpress_id']}: {e}")
    
    cur.close()
    conn.close()
    return ins, upd

# === MAIN ===
print("=" * 65)
print("  TEST SCRAPLING -> PostgreSQL (2 categorii)")
print("=" * 65)

conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM products")
initial = cur.fetchone()[0]
cur.close()
conn.close()
print(f"  Produse existente: {initial:,}")

queries = ["wellness-supplements", "collagen-supplement"]
total_ins = total_upd = 0

for q in queries:
    ins, upd = scrape_and_save(q)
    total_ins += ins
    total_upd += upd
    print(f"  [DB] +{ins} noi, ~{upd} actualizate")
    time.sleep(3)

conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM products")
final = cur.fetchone()[0]
cur.close()
conn.close()

print(f"\n{'='*65}")
print(f"  REZULTAT: {initial:,} -> {final:,} (+{final-initial} produse noi!)")
print(f"  Total inserate: {total_ins}, actualizate: {total_upd}")
print(f"{'='*65}")
