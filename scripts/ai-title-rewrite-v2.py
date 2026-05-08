"""
AI Title Rewriter v2 — Scrie titluri SEO și în NeonDB (production)
Citește Vercel DATABASE_URL și actualizează ambele baze de date

Usage:
  python scripts/ai-title-rewrite-v2.py --limit 100
"""

import json, time, sys, os, re, urllib.request
import psycopg2

OPENROUTER_KEY = "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"
MODEL = "google/gemini-2.0-flash-001"
BATCH_SIZE = 20
DELAY = 1.0

# LOCAL DB
LOCAL_DB = "postgresql://postgres:postgres@localhost:5432/aicevrei_products_cj"

# NEON DB — read from vercel env or set manually
NEON_DB = os.environ.get('NEON_DATABASE_URL', '')

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

    # Connect to LOCAL DB
    local_conn = psycopg2.connect(LOCAL_DB)
    local_cur = local_conn.cursor()
    
    # Try to connect to NEON DB
    neon_conn = None
    neon_cur = None
    if NEON_DB:
        try:
            neon_conn = psycopg2.connect(NEON_DB, sslmode='require')
            neon_cur = neon_conn.cursor()
            # Check if title_ro column exists in neon
            neon_cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='title_ro'")
            if not neon_cur.fetchone():
                print("  ⚠️  Adaug coloana title_ro pe NeonDB...")
                neon_cur.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS title_ro TEXT")
                neon_conn.commit()
            print("  ✅ Conectat la NeonDB!")
        except Exception as e:
            print(f"  ⚠️  NeonDB nu e disponibil: {e}")
            neon_conn = None
    else:
        print("  ℹ️  NEON_DATABASE_URL nu e setat — scriu doar local")

    # Get products
    local_cur.execute("""
        SELECT id, title FROM products 
        WHERE (title_ro IS NULL OR title_ro = '') 
        AND title IS NOT NULL AND title != ''
        AND cost_usd > 0
        ORDER BY pushed_to_shopify DESC, cost_usd DESC
        LIMIT %s
    """, (limit,))
    products = local_cur.fetchall()
    
    total = len(products)
    if total == 0:
        print("✅ Toate produsele au deja titlu românesc!")
        return

    target = "LOCAL" + (" + NEON" if neon_conn else "")
    print('=' * 70)
    print(f'  🤖 AI TITLE REWRITER v2 — Target: {target}')
    print(f'  {total:,} produse de procesat în batch-uri de {BATCH_SIZE}')
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
                # Update LOCAL
                local_cur.execute("UPDATE products SET title_ro = %s WHERE id = %s", (ro_title, prod_id))
                # Update NEON
                if neon_cur:
                    try:
                        neon_cur.execute("UPDATE products SET title_ro = %s WHERE id = %s", (ro_title, prod_id))
                    except Exception as e:
                        neon_conn.rollback()
                batch_updated += 1
        
        local_conn.commit()
        if neon_conn:
            try:
                neon_conn.commit()
            except:
                neon_conn.rollback()
        
        updated += batch_updated
        elapsed = time.time() - start_time
        rate = updated / elapsed if elapsed > 0 else 0
        eta = (total - batch_start - BATCH_SIZE) / rate / 60 if rate > 0 else 0
        
        # Show progress every 5 batches
        if batch_num % 5 == 0 or batch_num <= 3:
            print(f"  Batch {batch_num}/{total_batches} | {updated:,}/{total:,} | ETA: {eta:.0f}min")
            if batch_updated > 0 and i < len(ro_titles) and ro_titles[0]:
                print(f"    → {ro_titles[0][:60]}")
        
        time.sleep(DELAY)
    
    elapsed = time.time() - start_time
    print(f'\n  ✅ FINALIZAT: {updated:,}/{total:,} în {elapsed/60:.1f}min | Target: {target}')
    
    local_conn.close()
    if neon_conn:
        neon_conn.close()

if __name__ == '__main__':
    main()
