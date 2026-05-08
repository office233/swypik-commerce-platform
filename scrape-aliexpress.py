"""
AliExpress Mass Scraper v3 - ANTI-BAN EDITION
Scrapling StealthyFetcher -> PostgreSQL

Strategii anti-ban:
1. Delay random 20-45s intre pagini
2. Rotatie browser fingerprint (Scrapling face automat)  
3. Max 3 pagini pe categorie, apoi pauza lunga
4. Sesiune noua de browser la fiecare categorie
5. Suport proxy-uri (daca ai)
"""
import psycopg2
import re
import time
import random
import sys
import json
from datetime import datetime

# ============================================
# CONFIG
# ============================================
DB = {
    'host': 'localhost',
    'user': 'postgres',
    'password': 'postgres',
    'dbname': 'aicevrei_products_dser'
}

# Anti-ban settings
MIN_DELAY = 20      # Minim 20 secunde intre pagini
MAX_DELAY = 45      # Maxim 45 secunde
CATEGORY_PAUSE = 60 # 60s pauza intre categorii
MAX_PAGES_PER_CAT = 2  # Max 2 pagini per categorie
MAX_ERRORS = 3      # Oprire dupa 3 erori consecutive

# Proxy (optional - lasa None daca nu ai)
# Exemplu: "http://user:pass@proxy.example.com:8080"
PROXY = None

# Categorii AliExpress cu ID-uri reale
CATEGORIES = [
    # Haine femei (nisa ta principala)
    {"q": "women-dresses-summer", "name": "Dresses Summer"},
    {"q": "women-dresses-evening", "name": "Evening Dresses"},
    {"q": "women-bodycon-dress", "name": "Bodycon Dresses"},
    {"q": "women-maxi-dress-boho", "name": "Maxi Boho Dresses"},
    {"q": "women-mini-skirt-y2k", "name": "Mini Skirts Y2K"},
    {"q": "women-pleated-skirt", "name": "Pleated Skirts"},
    {"q": "women-denim-skirt", "name": "Denim Skirts"},
    {"q": "women-yoga-leggings", "name": "Yoga Leggings"},
    {"q": "women-gym-leggings-seamless", "name": "Gym Leggings"},
    {"q": "women-winter-leggings-thermal", "name": "Winter Leggings"},
    {"q": "women-hoodie-oversized", "name": "Oversized Hoodies"},
    {"q": "women-sweatshirt-vintage", "name": "Vintage Sweatshirts"},
    {"q": "women-crop-top-hoodie", "name": "Crop Hoodies"},
    {"q": "women-fur-coat-faux", "name": "Faux Fur Coats"},
    {"q": "women-leather-jacket-faux", "name": "Leather Jackets"},
    {"q": "women-parka-winter-down", "name": "Winter Parkas"},
    {"q": "women-puffer-jacket-short", "name": "Puffer Jackets"},
    {"q": "women-blazer-casual", "name": "Blazers"},
    {"q": "women-cardigan-knitted", "name": "Cardigans"},
    {"q": "women-jumpsuit-elegant", "name": "Jumpsuits"},
    # Accesorii femei
    {"q": "women-handbag-shoulder", "name": "Shoulder Bags"},
    {"q": "women-sunglasses-vintage", "name": "Sunglasses"},
    {"q": "women-jewelry-minimalist", "name": "Minimalist Jewelry"},
    {"q": "women-scarf-silk", "name": "Silk Scarves"},
    # Incaltaminte
    {"q": "women-sneakers-platform", "name": "Platform Sneakers"},
    {"q": "women-boots-ankle", "name": "Ankle Boots"},
    {"q": "women-heels-stiletto", "name": "Stiletto Heels"},
    # Home & Beauty (bonus)
    {"q": "led-strip-lights-room", "name": "LED Strip Lights"},
    {"q": "phone-case-aesthetic", "name": "Phone Cases"},
    {"q": "skincare-tools-face", "name": "Skincare Tools"},
]

from scrapling.fetchers import StealthyFetcher

def extract_id(url):
    m = re.search(r'/item/(\d+)', url)
    return m.group(1) if m else None

def extract_price(text):
    if not text: return None
    m = re.search(r'[\d]+[.,]?\d*', text.replace(',', '.'))
    return float(m.group()) if m else None

def scrape_page(query, page_num=1):
    """Scrapuie o pagina AliExpress cu anti-ban"""
    url = f"https://www.aliexpress.com/w/wholesale-{query}.html"
    if page_num > 1:
        url += f"?page={page_num}"
    
    print(f"    [FETCH] {url}")
    
    start = time.time()
    try:
        kwargs = {
            'headless': True,
            'network_idle': True,
            'google_search': True,
        }
        if PROXY:
            kwargs['proxy'] = PROXY
            
        page = StealthyFetcher.fetch(url, **kwargs)
        elapsed = time.time() - start
        print(f"    [OK] {elapsed:.1f}s")
    except Exception as e:
        print(f"    [EROARE] {e}")
        return None  # None = eroare, [] = pagina goala
    
    # Verificam daca e pagina de ban
    product_links = page.css('a[href*="/item/"]')
    if not product_links or len(product_links) == 0:
        print(f"    [WARN] 0 produse - posibil blocat")
        return []
    
    print(f"    [INFO] {len(product_links)} link-uri gasite")
    
    products = []
    seen = set()
    
    for link in product_links:
        href = link.attrib.get('href', '')
        ae_id = extract_id(href)
        if not ae_id or ae_id in seen:
            continue
        seen.add(ae_id)
        
        # URL curat
        if href.startswith('//'): full_url = 'https:' + href
        elif href.startswith('/'): full_url = 'https://www.aliexpress.com' + href
        else: full_url = href
        clean_url = full_url.split('?')[0]
        
        # Extragem date
        title = price = image = None
        el = link
        for _ in range(6):
            if el is None: break
            if not title:
                t = el.css('[class*="title"]::text, [class*="Title"]::text, [class*="name"]::text, h3::text')
                if t: title = t.get()
            if not price:
                p = el.css('[class*="price"]::text, [class*="Price"]::text')
                if p: price = extract_price(p.get())
            if not image:
                imgs = el.css('img')
                if imgs:
                    for img in imgs:
                        src = img.attrib.get('src', '') or img.attrib.get('data-src', '')
                        if src and ('alicdn' in src or 'aliexpress' in src):
                            image = ('https:' + src) if src.startswith('//') else src
                            break
            try: el = el.parent
            except: break
        
        if title and len(title.strip()) > 5:
            products.append({
                'id': ae_id, 'url': clean_url,
                'title': title.strip()[:500],
                'price': price, 'image': image
            })
    
    return products

def save_products(products, category_name):
    """Salveaza in PostgreSQL"""
    if not products: return 0, 0
    
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()
    ins = upd = 0
    
    for p in products:
        try:
            cur.execute("SELECT id FROM products WHERE aliexpress_id = %s", (p['id'],))
            if cur.fetchone():
                cur.execute("""UPDATE products SET 
                    price_usd = COALESCE(%s, price_usd),
                    main_image = COALESCE(%s, main_image), 
                    updated_at = NOW() WHERE aliexpress_id = %s""",
                    (p['price'], p['image'], p['id']))
                upd += 1
            else:
                cur.execute("""INSERT INTO products 
                    (aliexpress_id, aliexpress_url, title, category_name, 
                     price_usd, main_image, detail_fetched, variants_fetched, 
                     pushed_to_shopify, is_expired, is_fake_quantity, is_incomplete,
                     created_at, updated_at)
                    VALUES (%s,%s,%s,%s,%s,%s,false,false,false,false,false,false,NOW(),NOW())""",
                    (p['id'], p['url'], p['title'], category_name,
                     p['price'] if p['price'] else 0.00, p['image']))
                ins += 1
            conn.commit()
        except Exception as e:
            conn.rollback()
    
    cur.close(); conn.close()
    return ins, upd

def get_count():
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM products")
    c = cur.fetchone()[0]
    cur.close(); conn.close()
    return c

# ============================================
# MAIN
# ============================================
def main():
    print("=" * 65)
    print("  ALIEXPRESS MASS SCRAPER v3 — ANTI-BAN EDITION")
    print("  Scrapling StealthyFetcher -> PostgreSQL")
    print("=" * 65)
    
    initial = get_count()
    print(f"\n  Produse existente: {initial:,}")
    print(f"  Categorii: {len(CATEGORIES)}")
    print(f"  Delay: {MIN_DELAY}-{MAX_DELAY}s | Pauza categorie: {CATEGORY_PAUSE}s")
    print(f"  Proxy: {'DA - ' + PROXY[:30] if PROXY else 'NU (IP direct)'}")
    print(f"  Start: {datetime.now().strftime('%H:%M:%S')}")
    
    total_ins = total_upd = 0
    errors = 0
    
    for i, cat in enumerate(CATEGORIES, 1):
        print(f"\n{'='*65}")
        print(f"  [{i}/{len(CATEGORIES)}] {cat['name']} ({cat['q']})")
        print(f"{'='*65}")
        
        cat_ins = cat_upd = 0
        
        for page_num in range(1, MAX_PAGES_PER_CAT + 1):
            # Random delay INAINTE de fetch
            delay = random.uniform(MIN_DELAY, MAX_DELAY)
            print(f"\n    [WAIT] {delay:.0f}s delay anti-ban...")
            time.sleep(delay)
            
            try:
                products = scrape_page(cat['q'], page_num)
                
                if products is None:
                    # Eroare de conexiune
                    errors += 1
                    print(f"    [!] Eroare #{errors}")
                    if errors >= MAX_ERRORS:
                        print(f"\n  [STOP] Prea multe erori consecutive!")
                        break
                    continue
                
                if len(products) == 0:
                    # Pagina goala sau blocat
                    print(f"    [!] Pagina goala - skip rest categorie")
                    break
                
                errors = 0  # Reset error counter
                ins, upd = save_products(products, f"Women's clothing > {cat['name']}")
                cat_ins += ins
                cat_upd += upd
                print(f"    [DB] +{ins} noi, ~{upd} actualizate")
                
            except KeyboardInterrupt:
                print(f"\n\n  [STOP] Oprit manual!")
                break
            except Exception as e:
                print(f"    [ERR] {e}")
                errors += 1
        
        total_ins += cat_ins
        total_upd += cat_upd
        print(f"  [{cat['name']}] Total: +{cat_ins} noi, ~{cat_upd} actualizate")
        
        if errors >= MAX_ERRORS:
            break
        
        # Pauza mare intre categorii
        if i < len(CATEGORIES):
            pause = CATEGORY_PAUSE + random.uniform(0, 30)
            print(f"\n  [PAUZA] {pause:.0f}s intre categorii...")
            time.sleep(pause)
    
    # Raport
    final = get_count()
    print(f"\n{'='*65}")
    print(f"  RAPORT FINAL")
    print(f"{'='*65}")
    print(f"  Produse noi:       +{total_ins}")
    print(f"  Produse updatate:  ~{total_upd}")
    print(f"  DB: {initial:,} -> {final:,} (+{final-initial})")
    print(f"  Terminat: {datetime.now().strftime('%H:%M:%S')}")
    print(f"{'='*65}")

if __name__ == '__main__':
    main()
