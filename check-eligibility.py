import psycopg2
conn = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_dser')
cur = conn.cursor()

print('=== DE CE DOAR 63 DIN 100? ===')
print()

cur.execute('SELECT COUNT(*) FROM products')
print(f'Total in DB: {cur.fetchone()[0]:,}')

cur.execute('SELECT COUNT(*) FROM products WHERE pushed_to_shopify = true')
print(f'Deja pe Shopify: {cur.fetchone()[0]:,}')

# Filtrul actual din script
cur.execute("""SELECT COUNT(*) FROM products WHERE pushed_to_shopify = FALSE 
    AND quality_score >= 50 AND image_count >= 2 
    AND cost_usd > 0.5 AND cost_usd < 200""")
print(f'Eligibile (score>=50, 2+ img, cost OK): {cur.fetchone()[0]:,}')

print()
print('=== CE BLOCHEAZA RESTUL? ===')

cur.execute('SELECT COUNT(*) FROM products WHERE quality_score IS NULL OR quality_score = 0')
print(f'Fara quality_score: {cur.fetchone()[0]:,}')

cur.execute('SELECT COUNT(*) FROM products WHERE quality_score > 0 AND quality_score < 50')
print(f'Score < 50 (prea slab): {cur.fetchone()[0]:,}')

cur.execute('SELECT COUNT(*) FROM products WHERE image_count IS NULL OR image_count < 2')
print(f'Mai putin de 2 imagini: {cur.fetchone()[0]:,}')

cur.execute("SELECT COUNT(*) FROM products WHERE cost_usd IS NULL OR cost_usd <= 0.5")
print(f'Fara cost / cost prea mic: {cur.fetchone()[0]:,}')

print()
print('=== CU CRITERII RELAXATE ===')

cur.execute("""SELECT COUNT(*) FROM products WHERE pushed_to_shopify = FALSE 
    AND quality_score >= 40 AND image_count >= 1 AND cost_usd > 0""")
print(f'Score >= 40, 1+ imagini: {cur.fetchone()[0]:,}')

cur.execute("""SELECT COUNT(*) FROM products WHERE pushed_to_shopify = FALSE 
    AND quality_score >= 30 AND image_count >= 1 AND cost_usd > 0""")
print(f'Score >= 30, 1+ imagini: {cur.fetchone()[0]:,}')

cur.execute("""SELECT COUNT(*) FROM products WHERE pushed_to_shopify = FALSE 
    AND main_image IS NOT NULL AND price_usd > 1""")
print(f'Orice cu imagine + pret > 1 USD: {cur.fetchone()[0]:,}')

cur.execute("""SELECT COUNT(*) FROM products WHERE pushed_to_shopify = FALSE 
    AND main_image IS NOT NULL""")
print(f'Orice cu imagine: {cur.fetchone()[0]:,}')

print()
print('=== RECOMANDARE ===')
print('Poti rula: node scripts/ae-push-shopify.js 1000 30')
print('  -> 1000 produse, min score 30')
print('Sau:       node scripts/ae-push-shopify.js 5000 0')
print('  -> TOATE produsele care au imagini')

cur.close(); conn.close()
