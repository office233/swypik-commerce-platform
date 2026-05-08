"""
Test Scrapling - AliExpress Product Scraper
Testam capacitatile Scrapling de scraping adaptiv
"""
from scrapling.fetchers import Fetcher, StealthyFetcher
import json
import time

print("=" * 60)
print("🕷️  SCRAPLING TEST - AliExpress Scraper")
print("=" * 60)

# ============================================
# TEST 1: Basic HTTP fetch (rapid, fara browser)
# ============================================
print("\n📡 TEST 1: Fetcher basic (HTTP) - quotes.toscrape.com")
print("-" * 50)

try:
    page = Fetcher.get('https://quotes.toscrape.com/', stealthy_headers=True)
    quotes = page.css('.quote')
    print(f"✅ Gasit {len(quotes)} citate!")
    
    for i, quote in enumerate(quotes[:3]):
        text = quote.css('.text::text').get()
        author = quote.css('.author::text').get()
        print(f"   {i+1}. {author}: {text[:60]}...")
    
except Exception as e:
    print(f"❌ Eroare: {e}")

# ============================================
# TEST 2: Scrape AliExpress cu StealthyFetcher
# ============================================
print("\n\n🔒 TEST 2: StealthyFetcher - AliExpress (bypass anti-bot)")
print("-" * 50)

try:
    # Cautam produse de wellness/supplements pe AliExpress
    url = "https://www.aliexpress.com/w/wholesale-wellness-supplements.html"
    print(f"   Fetching: {url}")
    print(f"   (poate dura 10-30 secunde cu browser stealth...)")
    
    start = time.time()
    page = StealthyFetcher.fetch(
        url, 
        headless=True,
        network_idle=True
    )
    elapsed = time.time() - start
    print(f"   ⏱️  Fetch completat in {elapsed:.1f}s")
    
    # Incercam sa gasim produse
    # AliExpress foloseste diverse clase CSS
    products = (
        page.css('[class*="product"]') or 
        page.css('[class*="item"]') or
        page.css('[class*="card"]') or
        page.css('a[href*="/item/"]')
    )
    
    print(f"   📦 Elemente gasite: {len(products) if products else 0}")
    
    if products:
        for i, prod in enumerate(products[:5]):
            title = prod.css('h1::text, h2::text, h3::text, [class*="title"]::text, [class*="name"]::text').get()
            price = prod.css('[class*="price"]::text, [class*="Price"]::text').get()
            link = prod.attrib.get('href', '')
            
            print(f"\n   🛒 Produs {i+1}:")
            if title:
                print(f"      Titlu: {title[:80]}")
            if price:
                print(f"      Pret: {price}")
            if link:
                print(f"      Link: {link[:80]}")
    
    # Salvam HTML-ul raw pentru analiza
    html_len = len(str(page.html)) if page.html else 0
    print(f"\n   📄 HTML total: {html_len:,} caractere")
    
    # Salvam pagina pentru debug
    with open('d:/Aicevrei/aliexpress-raw.html', 'w', encoding='utf-8') as f:
        f.write(str(page.html) if page.html else "No HTML")
    print(f"   💾 HTML salvat in aliexpress-raw.html")
    
except Exception as e:
    print(f"❌ Eroare StealthyFetcher: {e}")
    import traceback
    traceback.print_exc()

# ============================================
# TEST 3: Scrape un produs specific AliExpress
# ============================================
print("\n\n🎯 TEST 3: Produs specific AliExpress")
print("-" * 50)

try:
    # Un produs popular - gua sha tool (relevant pentru Therapium)
    url = "https://www.aliexpress.com/item/1005006123456789.html"
    print(f"   Fetching produs specific...")
    
    start = time.time()
    page = Fetcher.get(url, stealthy_headers=True)
    elapsed = time.time() - start
    
    title = page.css('h1::text, [class*="title"]::text, title::text').get()
    price = page.css('[class*="price"]::text, [class*="Price"]::text').get()
    
    print(f"   ⏱️  Fetch: {elapsed:.1f}s")
    print(f"   Titlu: {title}")
    print(f"   Pret: {price}")
    print(f"   HTML size: {len(str(page.html)):,} chars")
    
except Exception as e:
    print(f"   ⚠️  Eroare (normal pentru produs invalid): {e}")

# ============================================
# TEST 4: Adaptive parsing demo
# ============================================
print("\n\n🧠 TEST 4: Adaptive Parsing (quotes.toscrape.com)")
print("-" * 50)

try:
    page = Fetcher.get('https://quotes.toscrape.com/')
    
    # Prima data - salvam selectorul
    quotes = page.css('.quote', auto_save=True)
    print(f"   ✅ Prima rulare: {len(quotes)} citate gasite si salvate")
    
    # A doua oara - folosim adaptive mode
    quotes2 = page.css('.quote', adaptive=True)
    print(f"   ✅ Adaptive mode: {len(quotes2)} citate regasite")
    
    # Cautam elemente similare
    first_quote = quotes[0]
    similar = first_quote.find_similar()
    print(f"   🔍 Elemente similare primului citat: {len(similar)}")
    
except Exception as e:
    print(f"   ⚠️  Eroare: {e}")

print("\n" + "=" * 60)
print("🏁 TESTE COMPLETE!")
print("=" * 60)
