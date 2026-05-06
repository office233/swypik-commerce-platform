"""
Raport complet - ce produse ai deja in aicevrei_products_dser
"""
import psycopg2

conn = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_dser')
cur = conn.cursor()

print("=" * 70)
print("  RAPORT PRODUSE - aicevrei_products_dser")
print("=" * 70)

# Total
cur.execute("SELECT COUNT(*) FROM products")
print(f"\n  TOTAL PRODUSE: {cur.fetchone()[0]:,}")

# Per categorie
print(f"\n  CATEGORII:")
cur.execute("""SELECT category_name, COUNT(*) as cnt, 
    ROUND(AVG(price_usd)::numeric, 2) as avg_price,
    ROUND(MIN(price_usd)::numeric, 2) as min_price,
    ROUND(MAX(price_usd)::numeric, 2) as max_price
    FROM products WHERE category_name IS NOT NULL
    GROUP BY category_name ORDER BY cnt DESC""")
for row in cur.fetchall():
    print(f"    {row[0]}: {row[1]:,} produse | ${row[2]} avg | ${row[3]}-${row[4]}")

# Status
print(f"\n  STATUS:")
cur.execute("SELECT COUNT(*) FROM products WHERE detail_fetched = true")
print(f"    Cu detalii complete: {cur.fetchone()[0]:,}")
cur.execute("SELECT COUNT(*) FROM products WHERE pushed_to_shopify = true")
print(f"    Pushed la Shopify: {cur.fetchone()[0]:,}")
cur.execute("SELECT COUNT(*) FROM products WHERE main_image IS NOT NULL AND main_image != ''")
print(f"    Cu imagine: {cur.fetchone()[0]:,}")
cur.execute("SELECT COUNT(*) FROM products WHERE price_usd > 0")
print(f"    Cu pret > $0: {cur.fetchone()[0]:,}")
cur.execute("SELECT COUNT(*) FROM products WHERE rating IS NOT NULL AND rating > 0")
print(f"    Cu rating: {cur.fetchone()[0]:,}")
cur.execute("SELECT COUNT(*) FROM products WHERE total_sales IS NOT NULL AND total_sales > 0")
print(f"    Cu vanzari: {cur.fetchone()[0]:,}")

# Top produse dupa vanzari
print(f"\n  TOP 10 PRODUSE (dupa vanzari):")
cur.execute("""SELECT title, price_usd, total_sales, rating, category_name 
    FROM products WHERE total_sales > 0 
    ORDER BY total_sales DESC LIMIT 10""")
for i, row in enumerate(cur.fetchall(), 1):
    title = row[0][:65] if row[0] else 'N/A'
    print(f"    {i}. {title}")
    print(f"       ${row[1]} | {row[2]:,} vanzari | {row[3]} rating | {row[4]}")

# Top produse dupa rating
print(f"\n  TOP 10 PRODUSE (dupa rating):")
cur.execute("""SELECT title, price_usd, total_sales, rating, category_name 
    FROM products WHERE rating IS NOT NULL AND rating > 4.5 AND total_sales > 100
    ORDER BY rating DESC, total_sales DESC LIMIT 10""")
for i, row in enumerate(cur.fetchall(), 1):
    title = row[0][:65] if row[0] else 'N/A'
    print(f"    {i}. {title}")
    print(f"       ${row[1]} | {row[2]:,} vanzari | {row[3]} rating")

# Produse cu potential de dropshipping (pret mic, vanzari mari)
print(f"\n  WINNERS (pret < $30, vanzari > 500, rating > 4.0):")
cur.execute("""SELECT title, price_usd, total_sales, rating, category_name 
    FROM products 
    WHERE price_usd > 0 AND price_usd < 30 
    AND total_sales > 500 AND rating > 4.0
    ORDER BY total_sales DESC LIMIT 15""")
winners = cur.fetchall()
if winners:
    for i, row in enumerate(winners, 1):
        title = row[0][:65] if row[0] else 'N/A'
        print(f"    {i}. {title}")
        print(f"       ${row[1]} | {row[2]:,} sold | {row[3]}* | {row[4]}")
else:
    print(f"    (niciun produs nu matcheaza - verificam cu criterii mai relaxate)")
    cur.execute("""SELECT title, price_usd, total_sales, rating 
        FROM products WHERE price_usd > 0 AND total_sales > 0
        ORDER BY total_sales DESC LIMIT 10""")
    for i, row in enumerate(cur.fetchall(), 1):
        title = row[0][:65] if row[0] else 'N/A'
        print(f"    {i}. {title} | ${row[1]} | {row[2]} sold | {row[3]}*")

# Variante
print(f"\n  VARIANTE:")
cur.execute("SELECT COUNT(*) FROM variants")
print(f"    Total variante: {cur.fetchone()[0]:,}")

# CJ products
print(f"\n  BAZA CJ DROPSHIPPING:")
conn2 = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_cj')
cur2 = conn2.cursor()
cur2.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
tables = [r[0] for r in cur2.fetchall()]
print(f"    Tabele: {tables}")
for t in tables:
    cur2.execute(f"SELECT COUNT(*) FROM {t}")
    print(f"    [{t}]: {cur2.fetchone()[0]:,} randuri")
cur2.close()
conn2.close()

cur.close()
conn.close()
