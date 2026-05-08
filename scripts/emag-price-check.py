"""
eMAG Price Scraper — Competitor Intelligence Tool
Caută produse pe eMAG și compară cu prețurile tale.
Usage: python scripts/emag-price-check.py "wireless charger"
       python scripts/emag-price-check.py --batch 20  (top 20 produse din DB)
"""

import sys, json, re, time, random
import urllib.request
import urllib.parse
import psycopg2

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
}

USD_TO_RON = 4.5

def search_emag(query, max_results=5):
    """Search eMAG and extract prices from search results page"""
    q = urllib.parse.quote(query)
    url = f'https://www.emag.ro/search/{q}'
    
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
    except Exception as e:
        return {'error': str(e), 'prices': []}
    
    # Extract prices using regex patterns
    # eMAG uses data attributes and specific class patterns for prices
    prices = []
    
    # Pattern 1: price integer from data attributes or price spans
    # eMAG format: "XX<sup>XX</sup> Lei" or data-price="XX.XX"
    price_patterns = [
        r'data-price="([\d.]+)"',
        r'"price":\s*([\d.]+)',
        r'product-new-price">\s*([\d.,]+)\s*<sup',
        r'product-new-price">([\d.,]+)',
        r'class="product-new-price"[^>]*>([\d.,\s]+)',
    ]
    
    for pattern in price_patterns:
        matches = re.findall(pattern, html)
        for m in matches:
            try:
                p = float(m.replace('.', '').replace(',', '.').replace(' ', ''))
                if 1 < p < 50000:  # reasonable price range in RON
                    prices.append(p)
            except:
                pass
        if prices:
            break
    
    # Also try to find product cards with titles and prices
    # Pattern for product card title
    titles = re.findall(r'data-name="([^"]+)"', html)
    card_prices = re.findall(r'data-price="([\d.]+)"', html)
    
    products = []
    for i in range(min(len(titles), len(card_prices), max_results)):
        try:
            products.append({
                'title': titles[i][:60],
                'price': float(card_prices[i]),
            })
        except:
            pass
    
    # Deduplicate and sort prices
    unique_prices = sorted(set(prices))[:max_results]
    
    return {
        'query': query,
        'url': url,
        'prices': unique_prices,
        'min_price': min(unique_prices) if unique_prices else None,
        'max_price': max(unique_prices) if unique_prices else None,
        'avg_price': sum(unique_prices)/len(unique_prices) if unique_prices else None,
        'products': products,
        'total_found': len(unique_prices),
    }


def get_our_price(cost_usd, source='cj'):
    """Calculate our current sell price"""
    cost = float(cost_usd)
    if source == 'cj':
        ship = 3 if cost < 5 else (5 if cost < 20 else (8 if cost < 50 else 10))
    else:
        ship = 5 if cost < 5 else (8 if cost < 20 else (12 if cost < 50 else 15))
    
    total_ron = (cost + ship) * USD_TO_RON
    
    if total_ron < 30: mk = 3.5
    elif total_ron < 60: mk = 3.0
    elif total_ron < 120: mk = 2.8
    elif total_ron < 250: mk = 2.5
    else: mk = 2.2
    
    raw = total_ron * mk
    brackets = [49, 69, 79, 99, 129, 149, 199, 249, 299, 399, 499]
    thresholds = [55, 70, 85, 110, 140, 170, 220, 280, 350, 450, 600]
    
    sell = brackets[-1]
    for i, t in enumerate(thresholds):
        if raw < t:
            sell = brackets[i]
            break
    else:
        sell = int(raw / 100) * 100 - 1
    
    return {'cost_ron': round(total_ron, 1), 'sell_ron': sell, 'markup': round(sell/total_ron, 1)}


def run_single(query):
    """Search a single product"""
    print(f'\n🔍 Caut pe eMAG: "{query}"')
    result = search_emag(query)
    
    if result.get('error'):
        print(f'   ❌ Eroare: {result["error"]}')
        return
    
    if not result['prices']:
        print(f'   ⚠️  Nu am găsit prețuri pe eMAG')
        return
    
    print(f'   📊 Găsite {result["total_found"]} prețuri')
    print(f'   💰 Min: {result["min_price"]:.0f} RON | Max: {result["max_price"]:.0f} RON | Avg: {result["avg_price"]:.0f} RON')
    
    if result['products']:
        print(f'\n   Top produse eMAG:')
        for p in result['products'][:5]:
            print(f'     {p["price"]:>7.0f} RON | {p["title"]}')


def run_batch(limit=20):
    """Compare top products from DB with eMAG prices"""
    conn = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_cj')
    cur = conn.cursor()
    
    # Get popular product categories to check
    cur.execute("""
        SELECT title, cost_usd FROM products 
        WHERE pushed_to_shopify = true AND cost_usd > 0
        AND (LOWER(title) LIKE '%%phone case%%' OR LOWER(title) LIKE '%%charger%%'
        OR LOWER(title) LIKE '%%bluetooth%%' OR LOWER(title) LIKE '%%watch%%'
        OR LOWER(title) LIKE '%%earphone%%' OR LOWER(title) LIKE '%%power bank%%'
        OR LOWER(title) LIKE '%%led%%' OR LOWER(title) LIKE '%%headphone%%'
        OR LOWER(title) LIKE '%%speaker%%' OR LOWER(title) LIKE '%%cable%%'
        OR LOWER(title) LIKE '%%lamp%%' OR LOWER(title) LIKE '%%purifier%%')
        ORDER BY RANDOM()
        LIMIT %s
    """, (limit,))
    
    products = cur.fetchall()
    conn.close()
    
    print('=' * 85)
    print('  📊 COMPARAȚIE PREȚURI — AIcevrei vs eMAG')
    print('=' * 85)
    print(f'  {"Produs":<40} {"Cost":>6} {"Noi":>6} {"eMAG min":>9} {"Diff":>8} {"Status":>8}')
    print('  ' + '-' * 80)
    
    cheaper = 0
    expensive = 0
    no_data = 0
    
    for title, cost_usd in products:
        our = get_our_price(cost_usd, 'cj')
        
        # Extract key words for eMAG search
        words = title.lower().split()[:4]
        search_q = ' '.join(words)
        
        emag = search_emag(search_q, max_results=3)
        time.sleep(random.uniform(2, 4))  # Be nice to eMAG
        
        short = title[:39]
        
        if emag['min_price']:
            diff = our['sell_ron'] - emag['min_price']
            pct = (diff / emag['min_price']) * 100
            
            if diff < 0:
                status = '✅ CHEAP'
                cheaper += 1
            elif diff < 10:
                status = '🟡 ~EGAL'
                cheaper += 1
            else:
                status = '🔴 SCUMP'
                expensive += 1
            
            print(f'  {short:<40} {our["cost_ron"]:>5.0f} {our["sell_ron"]:>5} {emag["min_price"]:>8.0f} {diff:>+7.0f} {status}')
        else:
            no_data += 1
            print(f'  {short:<40} {our["cost_ron"]:>5.0f} {our["sell_ron"]:>5}     N/A      —    ⚪ N/A')
    
    print('  ' + '-' * 80)
    print(f'\n  📊 Rezultat: ✅ {cheaper} sub/egal eMAG | 🔴 {expensive} mai scumpi | ⚪ {no_data} fără date')
    print('=' * 85)


if __name__ == '__main__':
    if len(sys.argv) > 1:
        if sys.argv[1] == '--batch':
            limit = int(sys.argv[2]) if len(sys.argv) > 2 else 15
            run_batch(limit)
        else:
            query = ' '.join(sys.argv[1:])
            run_single(query)
    else:
        # Default: batch compare
        run_batch(15)
