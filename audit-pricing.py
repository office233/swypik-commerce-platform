import psycopg2

print('=' * 70)
print('  AUDIT COMPLET PRICING — AIcevrei')
print('=' * 70)

# CJ Products
cj = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_cj')
cc = cj.cursor()

print('\n  📦 CJ DROPSHIPPING (pe Shopify)')
print('  ' + '-' * 65)

# Products that were pushed to Shopify
cc.execute("""
    SELECT title, cost_usd, category 
    FROM products 
    WHERE pushed_to_shopify = true AND cost_usd > 0
    ORDER BY cost_usd ASC
    LIMIT 500
""")
cj_products = cc.fetchall()

# Pricing breakdown
cc.execute("""
    SELECT 
        COUNT(*) as total,
        AVG(cost_usd) as avg_cost,
        MIN(cost_usd) as min_cost,
        MAX(cost_usd) as max_cost,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cost_usd) as median
    FROM products WHERE pushed_to_shopify = true AND cost_usd > 0
""")
r = cc.fetchone()
print(f'    Pushed pe Shopify: {r[0]:,}')
print(f'    Cost USD: min ${r[2]:.2f} | avg ${r[1]:.2f} | median ${r[4]:.2f} | max ${r[3]:.2f}')

# Price distribution
cc.execute("""
    SELECT 
        CASE 
            WHEN cost_usd < 1 THEN 'Sub $1'
            WHEN cost_usd < 3 THEN '$1-3'
            WHEN cost_usd < 5 THEN '$3-5'
            WHEN cost_usd < 10 THEN '$5-10'
            WHEN cost_usd < 20 THEN '$10-20'
            WHEN cost_usd < 50 THEN '$20-50'
            ELSE '$50+'
        END as band,
        COUNT(*) as cnt,
        AVG(cost_usd) as avg_cost
    FROM products WHERE pushed_to_shopify = true AND cost_usd > 0
    GROUP BY band ORDER BY MIN(cost_usd)
""")
print(f'\n    Distributie cost:')
for row in cc.fetchall():
    # Calculate what Shopify price would be with current formula
    avg = float(row[2])
    ship = 3 if avg < 5 else (5 if avg < 20 else (8 if avg < 50 else 10))
    total = (avg + ship) * 4.5
    if total < 30: markup = 3.5
    elif total < 60: markup = 3.0
    elif total < 120: markup = 2.8
    elif total < 250: markup = 2.5
    else: markup = 2.2
    sell = total * markup
    print(f'      {row[0]:>8} | {row[1]:>5,} produse | avg cost ${row[2]:>6.2f} | sell ~{sell:>6.0f} RON | markup {sell/total:.1f}x')

# Show examples of expensive-looking cheap items
print(f'\n    🔍 Exemple produse IEFTINE cu pret MARE pe site:')
print(f'    {"Produs":<45} {"Cost $":>7} {"+ Ship":>7} {"Total RON":>10} {"Sell RON":>9}')
print(f'    {"-"*80}')

for title, cost_raw, cat in cj_products[:30]:
    cost = float(cost_raw)
    ship = 3 if cost < 5 else (5 if cost < 20 else (8 if cost < 50 else 10))
    total_ron = (cost + ship) * 4.5
    if total_ron < 30: markup = 3.5
    elif total_ron < 60: markup = 3.0
    elif total_ron < 120: markup = 2.8
    elif total_ron < 250: markup = 2.5
    else: markup = 2.2
    raw = total_ron * markup
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
    
    short = title[:44] if title else '?'
    print(f'    {short:<45} ${cost:>6.2f}  +${ship:<5} {total_ron:>8.0f} RON  {sell:>6} RON')

cj.close()

# AliExpress
ae = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_dser')
ac = ae.cursor()

print(f'\n\n  📦 ALIEXPRESS')
print('  ' + '-' * 65)

ac.execute("""
    SELECT 
        COUNT(*) as total,
        AVG(cost_usd) as avg_cost,
        MIN(cost_usd) as min_cost,
        MAX(cost_usd) as max_cost,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cost_usd) as median
    FROM products WHERE pushed_to_shopify = true AND cost_usd > 0
""")
r = ac.fetchone()
print(f'    Pushed pe Shopify: {r[0]:,}')
print(f'    Cost USD: min ${r[2]:.2f} | avg ${r[1]:.2f} | median ${r[4]:.2f} | max ${r[3]:.2f}')

# AE shipping is more expensive
ac.execute("""
    SELECT 
        CASE 
            WHEN cost_usd < 1 THEN 'Sub $1'
            WHEN cost_usd < 3 THEN '$1-3'
            WHEN cost_usd < 5 THEN '$3-5'
            WHEN cost_usd < 10 THEN '$5-10'
            WHEN cost_usd < 20 THEN '$10-20'
            WHEN cost_usd < 50 THEN '$20-50'
            ELSE '$50+'
        END as band,
        COUNT(*) as cnt,
        AVG(cost_usd) as avg_cost
    FROM products WHERE pushed_to_shopify = true AND cost_usd > 0
    GROUP BY band ORDER BY MIN(cost_usd)
""")
print(f'\n    Distributie cost:')
for row in ac.fetchall():
    avg = float(row[2])
    ship = 5 if avg < 5 else (8 if avg < 20 else (12 if avg < 50 else 15))
    total = (avg + ship) * 4.5
    if total < 30: markup = 3.5
    elif total < 60: markup = 3.0
    elif total < 120: markup = 2.8
    elif total < 250: markup = 2.5
    else: markup = 2.2
    sell = total * markup
    print(f'      {row[0]:>8} | {row[1]:>5,} produse | avg cost ${row[2]:>6.2f} | sell ~{sell:>6.0f} RON | markup {sell/total:.1f}x')

ae.close()

print(f'\n{"=" * 70}')
print(f'  CONCLUZIE:')
print(f'    Markup CJ:  2.5-3.5x pe (cost + transport $3-10)')
print(f'    Markup AE:  2.5-3.5x pe (cost + transport $5-15)')
print(f'    Un produs de $0.50 + $3 ship = $3.50 = 16 RON cost')  
print(f'    16 RON x 3.5 markup = 56 RON → se vinde la 49 RON')
print(f'    Un produs de $10 + $5 ship = $15 = 68 RON cost')
print(f'    68 RON x 2.8 markup = 190 RON → se vinde la 199 RON')
print('=' * 70)
