"""
AI Title Rewriter v3 — Scrie DIRECT în NeonDB (PRODUCTION)
+ sincronizează local

Usage:
  python scripts/ai-title-neon.py --limit 500
  python scripts/ai-title-neon.py --limit 109000   ← toate
"""

import json, time, sys, re, urllib.request
import psycopg2

OPENROUTER_KEY = "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"
MODEL = "google/gemini-2.0-flash-001"
BATCH_SIZE = 20
DELAY = 0.8

NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require'
LOCAL_URL = 'postgresql://postgres:postgres@localhost:5432/aicevrei_products_cj'

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

Răspunde DOAR cu titlurile românești, câte unul pe linie, fără numerotare."""

def ai_rewrite_batch(titles):
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
        lines = [l.strip() for l in content.split('\n') if l.strip()]
        cleaned = []
        for line in lines:
            line = re.sub(r'^\d+[\.\)\-]\s*', '', line).strip()
            line = line.strip('"').strip("'")
            if line and len(line) > 5:
                cleaned.append(line[:100])
        return cleaned
    except Exception as e:
        print(f"    ❌ AI Error: {e}")
        return []

def main():
    limit = 500
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == '--limit' and i+1 < len(args):
            limit = int(args[i+1])

    # Connect to NEON (production)
    neon = psycopg2.connect(NEON_URL)
    neon_cur = neon.cursor()
    
    # Connect to LOCAL
    try:
        local = psycopg2.connect(LOCAL_URL)
        local_cur = local.cursor()
        has_local = True
    except:
        has_local = False
        print("  ⚠️  Local DB nu e disponibil, scriu doar NeonDB")

    # Get products from NEON
    neon_cur.execute("""
        SELECT id, title FROM products 
        WHERE (title_ro IS NULL OR title_ro = '') 
        AND title IS NOT NULL AND title != ''
        AND cost_usd > 0
        ORDER BY pushed_to_shopify DESC NULLS LAST, cost_usd DESC
        LIMIT %s
    """, (limit,))
    products = neon_cur.fetchall()
    
    total = len(products)
    if total == 0:
        print("✅ Toate produsele au deja titlu românesc!")
        return

    print('=' * 70)
    print(f'  🤖 AI TITLE REWRITER v3 — NEONDB PRODUCTION')
    print(f'  {total:,} produse | batch {BATCH_SIZE} | model: {MODEL}')
    print('=' * 70)
    
    updated = 0
    start_time = time.time()
    
    for batch_start in range(0, total, BATCH_SIZE):
        batch = products[batch_start:batch_start + BATCH_SIZE]
        titles = [p[1] for p in batch]
        
        batch_num = batch_start // BATCH_SIZE + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
        
        ro_titles = ai_rewrite_batch(titles)
        
        while len(ro_titles) < len(batch):
            ro_titles.append(None)
        ro_titles = ro_titles[:len(batch)]
        
        batch_updated = 0
        for i, (prod_id, en_title) in enumerate(batch):
            ro_title = ro_titles[i] if i < len(ro_titles) and ro_titles[i] else None
            if ro_title:
                # NEON (production)
                neon_cur.execute("UPDATE products SET title_ro = %s WHERE id = %s", (ro_title, prod_id))
                # LOCAL
                if has_local:
                    try:
                        local_cur.execute("UPDATE products SET title_ro = %s WHERE id = %s", (ro_title, prod_id))
                    except:
                        local.rollback()
                batch_updated += 1
        
        neon.commit()
        if has_local:
            try:
                local.commit()
            except:
                local.rollback()
        
        updated += batch_updated
        elapsed = time.time() - start_time
        rate = updated / elapsed if elapsed > 0 else 0
        eta = (total - batch_start - BATCH_SIZE) / rate / 60 if rate > 0 else 0
        
        if batch_num % 5 == 0 or batch_num <= 3:
            print(f"  [{batch_num}/{total_batches}] {updated:,}/{total:,} | {rate:.0f}/s | ETA: {eta:.0f}min")
            if ro_titles and ro_titles[0]:
                print(f"    → {ro_titles[0][:65]}")
        
        time.sleep(DELAY)
    
    elapsed = time.time() - start_time
    
    # Final count
    neon_cur.execute("SELECT COUNT(*) FROM products WHERE title_ro IS NOT NULL AND title_ro != ''")
    neon_total = neon_cur.fetchone()[0]
    
    print(f'\n{"=" * 70}')
    print(f'  ✅ FINALIZAT: {updated:,} titluri noi | NeonDB total RO: {neon_total:,}')
    print(f'  Timp: {elapsed/60:.1f}min | Viteză: {updated/elapsed:.1f}/s')
    print(f'{"=" * 70}')
    
    neon.close()
    if has_local:
        local.close()

if __name__ == '__main__':
    main()
