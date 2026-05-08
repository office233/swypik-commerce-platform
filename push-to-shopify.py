"""
Raport produse + calcul profit - FARA file scan
"""
import psycopg2

DB = {'host': 'localhost', 'user': 'postgres', 'password': 'postgres', 'dbname': 'aicevrei_products_dser'}
MARKUP = 2.5
COMPARE_AT = 3.5
MIN_RATING = 4.0
MIN_SALES = 100

conn = psycopg2.connect(**DB)
cur = conn.cursor()

print("=" * 70)
print("  RAPORT PRODUSE + CALCUL PROFIT")
print("=" * 70)

# Eligibile
cur.execute("""SELECT COUNT(*) FROM products 
    WHERE rating >= %s AND total_sales >= %s AND price_usd >= 1
    AND pushed_to_shopify = false""", (MIN_RATING, MIN_SALES))
eligible = cur.fetchone()[0]

cur.execute("SELECT COUNT(*) FROM products WHERE pushed_to_shopify = true")
pushed = cur.fetchone()[0]

print(f"\n  Total in DB: 36,210")
print(f"  Deja pe Shopify: {pushed}")
print(f"  Eligibile (rating>={MIN_RATING}, sales>={MIN_SALES}): {eligible}")

# Per categorie cu profit
print(f"\n  CATEGORII CU PROFIT CALCULAT:")
print(f"  {'Categorie':<35} {'Prod':>5} {'Cost Avg':>9} {'Retail':>9} {'Profit':>9}")
print(f"  {'-'*35} {'-'*5} {'-'*9} {'-'*9} {'-'*9}")

cur.execute("""
    SELECT category_name, COUNT(*) as cnt,
        ROUND(AVG(price_usd)::numeric, 2),
        ROUND(AVG(price_usd * %s)::numeric, 2),
        ROUND(AVG(price_usd * %s - price_usd)::numeric, 2)
    FROM products 
    WHERE rating >= %s AND total_sales >= %s AND price_usd >= 1
    AND pushed_to_shopify = false
    GROUP BY category_name ORDER BY cnt DESC
""", (MARKUP, MARKUP, MIN_RATING, MIN_SALES))

total_profit = 0
for row in cur.fetchall():
    cat = row[0].split(' > ')[1] if ' > ' in row[0] else row[0]
    print(f"  {cat:<35} {row[1]:>5} ${row[2]:>7} ${row[3]:>7} ${row[4]:>7}")
    total_profit += float(row[4]) * row[1]

print(f"\n  PROFIT POTENTIAL: ${total_profit:,.2f}")

# Top 20
print(f"\n  TOP 20 WINNERS:")
print(f"  {'#':>3} {'Titlu':<45} {'Cost':>7} {'Retail':>8} {'Profit':>8} {'Sold':>6} {'*':>4}")
print(f"  {'-'*95}")

cur.execute("""SELECT title, price_usd, total_sales, rating
    FROM products WHERE rating >= %s AND total_sales >= %s AND price_usd >= 1
    AND pushed_to_shopify = false
    ORDER BY total_sales DESC, rating DESC LIMIT 20""", (MIN_RATING, MIN_SALES))

for i, row in enumerate(cur.fetchall(), 1):
    t = (row[0][:43] + '..') if len(row[0]) > 45 else row[0]
    cost = float(row[1])
    retail = round(cost * MARKUP, 2)
    profit = round(retail - cost, 2)
    print(f"  {i:>3} {t:<45} ${cost:>6.2f} ${retail:>7.2f} ${profit:>7.2f} {row[2]:>5,} {row[3]:>4.1f}")

print(f"\n  PRICING: Cost x{MARKUP} = Retail | Cost x{COMPARE_AT} = 'Was' price")
print(f"  Exemplu: $15 cost -> $37.50 retail -> $52.50 'was' -> $22.50 profit")

cur.close(); conn.close()
