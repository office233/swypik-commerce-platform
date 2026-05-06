"""
Test rapid Scrapling - verificam daca IP-ul e deblocat
"""
import time
from scrapling.fetchers import StealthyFetcher
import re

print("=" * 60)
print("  TEST SCRAPLING - AliExpress (dupa pauza)")
print("=" * 60)

url = "https://www.aliexpress.com/w/wholesale-women-dresses.html"
print(f"\n  [FETCH] {url}")
print(f"  [INFO] Asteptam 3s apoi fetch cu StealthyFetcher...")
time.sleep(3)

start = time.time()
try:
    page = StealthyFetcher.fetch(
        url,
        headless=True,
        network_idle=True,
        google_search=True,
    )
    elapsed = time.time() - start
    print(f"  [OK] Fetch completat in {elapsed:.1f}s")
    
    # Verificam daca e pagina de produse sau pagina de ban
    product_links = page.css('a[href*="/item/"]')
    all_links = page.css('a')
    
    print(f"  [INFO] Total linkuri: {len(all_links) if all_links else 0}")
    print(f"  [INFO] Link-uri /item/: {len(product_links) if product_links else 0}")
    
    if product_links and len(product_links) > 0:
        # SUCCES! Extragem produse
        seen = set()
        products = []
        for link in product_links:
            href = link.attrib.get('href', '')
            match = re.search(r'/item/(\d+)', href)
            if match and match.group(1) not in seen:
                seen.add(match.group(1))
                
                # Cautam titlu
                title = None
                el = link
                for _ in range(5):
                    if el is None: break
                    t = el.css('[class*="title"]::text, [class*="Title"]::text, h3::text')
                    if t:
                        title = t.get()
                        break
                    try: el = el.parent
                    except: break
                
                if title and len(title.strip()) > 5:
                    products.append({'id': match.group(1), 'title': title.strip()[:80]})
        
        print(f"\n  SUCCES! {len(products)} produse unice gasite!")
        for i, p in enumerate(products[:10], 1):
            print(f"    {i}. [{p['id']}] {p['title']}")
        if len(products) > 10:
            print(f"    ... si inca {len(products)-10}")
        
        print(f"\n  VERDICT: SCRAPLING FUNCTIONEAZA!")
    else:
        print(f"\n  ESEC - IP inca blocat sau pagina goala")
        print(f"  VERDICT: Mai asteapta sau foloseste proxy")

except Exception as e:
    print(f"  [EROARE] {e}")

print(f"\n{'='*60}")
