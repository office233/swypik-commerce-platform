"""
AI Title Rewriter — Titluri SEO atractive în română
Folosește OpenRouter (Gemini Flash) pentru rewriting în batch
Procesează 20 titluri per request pentru eficiență

Usage:
  python scripts/ai-title-rewrite.py              ← 500 produse (default)
  python scripts/ai-title-rewrite.py --limit 5000 ← 5000 produse
  python scripts/ai-title-rewrite.py --db ae      ← AliExpress DB
"""

import json, time, sys, urllib.request, urllib.parse
import psycopg2

OPENROUTER_KEY = "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"
MODEL = "google/gemini-2.0-flash-001"
BATCH_SIZE = 20  # titles per AI request
DELAY = 1.0  # seconds between requests

SYSTEM_PROMPT = """Ești expert SEO pentru un magazin online românesc de dropshipping (aicevrei.ro).
Primești o listă de titluri de produse în engleză. Pentru fiecare, generează un titlu SEO optimizat în ROMÂNĂ.

REGULI:
1. Titlul TREBUIE să fie în ROMÂNĂ
2. Maxim 70 caractere
3. Pune cuvintele cheie importante PRIMELE (pentru SEO)
4. Folosește cuvinte atractive: Premium, Profesional, Elegant, Ultra, Smart, etc.
5. NU traduce literal — rescrie pentru a fi ATRACTIV
6. Include tipul produsului + beneficiul principal
7. NU pune ghilimele, paranteze sau caractere speciale
8. Fiecare titlu pe o linie nouă, în aceeași ordine

EXEMPLE:
"Wireless Bluetooth Speaker" → "Boxa Bluetooth Portabilă Premium cu Sunet 360°"
"Phone Case With Camera Protector" → "Husă Telefon Premium cu Protecție Cameră"
"LED Strip Light RGB Color" → "Bandă LED RGB Smart cu Telecomandă"
"Power Bank 20000mAh Fast Charging" → "Baterie Externă 20000mAh Încărcare Rapidă USB-C"
"Smart Watch Heart Rate Monitor" → "Ceas Smartwatch cu Monitor Cardiac și Fitness"
"USB C Charger 100W Fast" → "Încărcător USB-C 100W Încărcare Ultra-Rapidă"

Răspunde DOAR cu titlurile românești, câte unul pe linie, fără numerotare."""

def ai_rewrite_batch(titles):
    """Send batch of titles to OpenRouter for rewriting"""
    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(titles))
    
    payload = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Rescrie aceste {len(titles)} titluri în română SEO:\n\n{numbered}"}
        ],
        "temperature": 0.3,
        "max_tokens": 2000,
    }).encode('utf-8')
    
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {OPENROUTER_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://aicevrei.ro",
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode('utf-8'))
        
        content = result['choices'][0]['message']['content'].strip()
        # Parse response — one title per line
        lines = [l.strip() for l in content.split('\n') if l.strip()]
        # Remove numbering if present
        cleaned = []
        for line in lines:
            # Remove "1. " or "1) " prefixes
            import re
            line = re.sub(r'^\d+[\.\)\-]\s*', '', line).strip()
            if line and len(line) > 5:
                cleaned.append(line[:100])  # cap at 100 chars
        
        return cleaned
    except Exception as e:
        print(f"    ❌ AI Error: {e}")
        return []


def main():
    # Parse args
    limit = 500
    db_name = 'aicevrei_products_cj'
    
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == '--limit' and i+1 < len(args):
            limit = int(args[i+1])
        if a == '--db' and i+1 < len(args):
            if args[i+1] == 'ae':
                db_name = 'aicevrei_products_dser'
    
    conn = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname=db_name)
    cur = conn.cursor()
    
    # Get products without Romanian title
    cur.execute("""
        SELECT id, title FROM products 
        WHERE (title_ro IS NULL OR title_ro = '') 
        AND title IS NOT NULL AND title != ''
        AND cost_usd > 0
        ORDER BY pushed_to_shopify DESC, cost_usd DESC
        LIMIT %s
    """, (limit,))
    products = cur.fetchall()
    
    total = len(products)
    if total == 0:
        print("✅ Toate produsele au deja titlu românesc!")
        return
    
    print('=' * 70)
    print(f'  🤖 AI TITLE REWRITER — {db_name}')
    print(f'  {total:,} produse de procesat în batch-uri de {BATCH_SIZE}')
    print(f'  Model: {MODEL}')
    print('=' * 70)
    
    updated = 0
    errors = 0
    start_time = time.time()
    
    for batch_start in range(0, total, BATCH_SIZE):
        batch = products[batch_start:batch_start + BATCH_SIZE]
        ids = [p[0] for p in batch]
        titles = [p[1] for p in batch]
        
        batch_num = batch_start // BATCH_SIZE + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
        
        print(f'\n  📝 Batch {batch_num}/{total_batches} ({len(batch)} titluri)...')
        
        # AI rewrite
        ro_titles = ai_rewrite_batch(titles)
        
        if len(ro_titles) != len(batch):
            print(f"    ⚠️  AI a returnat {len(ro_titles)} titluri (expected {len(batch)})")
            # Pad or truncate
            while len(ro_titles) < len(batch):
                ro_titles.append(None)
            ro_titles = ro_titles[:len(batch)]
        
        # Update DB
        batch_updated = 0
        for i, (prod_id, en_title) in enumerate(batch):
            ro_title = ro_titles[i] if i < len(ro_titles) and ro_titles[i] else None
            if ro_title:
                cur.execute("UPDATE products SET title_ro = %s WHERE id = %s", (ro_title, prod_id))
                batch_updated += 1
                if batch_updated <= 3:  # Show first 3 examples
                    print(f"    EN: {en_title[:50]}")
                    print(f"    RO: {ro_title}")
                    print()
        
        conn.commit()
        updated += batch_updated
        
        elapsed = time.time() - start_time
        rate = updated / elapsed if elapsed > 0 else 0
        eta = (total - batch_start - BATCH_SIZE) / rate / 60 if rate > 0 else 0
        
        print(f"    ✅ {batch_updated}/{len(batch)} actualizate | Total: {updated:,}/{total:,} | ETA: {eta:.0f}min")
        
        time.sleep(DELAY)
    
    elapsed = time.time() - start_time
    
    print('\n' + '=' * 70)
    print(f'  ✅ FINALIZAT!')
    print(f'  Traduse: {updated:,}/{total:,}')
    print(f'  Timp: {elapsed/60:.1f} minute')
    print(f'  Erori: {errors}')
    print('=' * 70)
    
    # Show sample
    cur.execute("SELECT title, title_ro FROM products WHERE title_ro IS NOT NULL AND title_ro != '' LIMIT 5")
    print('\n  📋 Exemple finale:')
    for en, ro in cur.fetchall():
        print(f'    EN: {en[:55]}')
        print(f'    RO: {ro}')
        print()
    
    conn.close()


if __name__ == '__main__':
    main()
