import psycopg2
conn = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_cj')
cur = conn.cursor()
cur.execute("""SELECT title, cost_usd, category FROM products 
    WHERE pushed_to_shopify = true AND cost_usd > 0 
    AND (LOWER(title) LIKE '%%wireless charger%%' OR LOWER(title) LIKE '%%phone case%%' 
    OR LOWER(title) LIKE '%%smart watch%%' OR LOWER(title) LIKE '%%bluetooth%%' 
    OR LOWER(title) LIKE '%%earbuds%%' OR LOWER(title) LIKE '%%power bank%%'
    OR LOWER(title) LIKE '%%led strip%%' OR LOWER(title) LIKE '%%headphone%%')
    ORDER BY cost_usd LIMIT 20""")
print('Produse TECH din DB-ul tau (pe Shopify):')
print('-' * 90)
for r in cur.fetchall():
    cost = float(r[1])
    ship = 3 if cost < 5 else (5 if cost < 20 else 8)
    total = (cost + ship) * 4.5
    # Current formula sell price
    if total < 30: mk = 3.5
    elif total < 60: mk = 3.0
    elif total < 120: mk = 2.8
    elif total < 250: mk = 2.5
    else: mk = 2.2
    raw = total * mk
    if raw < 55: sell = 49
    elif raw < 70: sell = 69
    elif raw < 85: sell = 79
    elif raw < 110: sell = 99
    elif raw < 140: sell = 129
    elif raw < 170: sell = 149
    elif raw < 220: sell = 199
    elif raw < 280: sell = 249
    elif raw < 350: sell = 299
    else: sell = int(raw / 100) * 100 - 1
    
    print(f'  ${cost:>6.2f} + ${ship} = {total:>5.0f} RON cost → {sell:>4} RON vanzare | {r[0][:55]}')
conn.close()
