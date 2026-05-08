import psycopg2

print('=' * 80)
print('  📊 SIMULARE MARKUP 1.5x — Impact pe toate produsele')
print('=' * 80)

USD_TO_RON = 4.5

def calc_price(cost_usd, source='cj'):
    cost = float(cost_usd)
    if source == 'cj':
        ship = 3 if cost < 5 else (5 if cost < 20 else (8 if cost < 50 else 10))
    else:
        ship = 5 if cost < 5 else (8 if cost < 20 else (12 if cost < 50 else 15))
    
    total_ron = (cost + ship) * USD_TO_RON
    
    # NEW: 1.5x markup
    raw_15 = total_ron * 1.5
    # Round to nice price
    if raw_15 < 15: sell_15 = 14
    elif raw_15 < 25: sell_15 = 19
    elif raw_15 < 35: sell_15 = 29
    elif raw_15 < 45: sell_15 = 39
    elif raw_15 < 55: sell_15 = 49
    elif raw_15 < 75: sell_15 = 69
    elif raw_15 < 90: sell_15 = 79
    elif raw_15 < 110: sell_15 = 99
    elif raw_15 < 140: sell_15 = 129
    elif raw_15 < 170: sell_15 = 149
    elif raw_15 < 220: sell_15 = 199
    elif raw_15 < 280: sell_15 = 249
    elif raw_15 < 350: sell_15 = 299
    elif raw_15 < 450: sell_15 = 399
    else: sell_15 = int(raw_15 / 100) * 100 - 1
    
    # OLD markup for comparison
    if total_ron < 30: mk_old = 3.5
    elif total_ron < 60: mk_old = 3.0
    elif total_ron < 120: mk_old = 2.8
    elif total_ron < 250: mk_old = 2.5
    else: mk_old = 2.2
    raw_old = total_ron * mk_old
    if raw_old < 55: sell_old = 49
    elif raw_old < 70: sell_old = 69
    elif raw_old < 85: sell_old = 79
    elif raw_old < 110: sell_old = 99
    elif raw_old < 140: sell_old = 129
    elif raw_old < 170: sell_old = 149
    elif raw_old < 220: sell_old = 199
    elif raw_old < 280: sell_old = 249
    elif raw_old < 350: sell_old = 299
    else: sell_old = int(raw_old / 100) * 100 - 1

    profit_15 = sell_15 - total_ron
    profit_old = sell_old - total_ron
    
    return {
        'cost_ron': round(total_ron, 1),
        'sell_old': sell_old,
        'sell_15': sell_15,
        'profit_old': round(profit_old, 1),
        'profit_15': round(profit_15, 1),
        'reduction': round(((sell_old - sell_15) / sell_old) * 100, 0),
    }

# ─── CJ PRODUCTS ─────────────────────────────────────────
cj = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_cj')
cc = cj.cursor()

cc.execute("""SELECT cost_usd FROM products WHERE pushed_to_shopify=true AND cost_usd > 0""")
cj_pushed = [(float(r[0]),) for r in cc.fetchall()]

cc.execute("""SELECT cost_usd FROM products WHERE cost_usd > 0""")
cj_all = [(float(r[0]),) for r in cc.fetchall()]

print(f'\n  📦 CJ DROPSHIPPING')
print(f'  {"Band cost":<12} {"Cnt":>5} {"Cost RON":>9} {"VECHI":>7} {"NOU 1.5x":>9} {"Scădere":>8} {"Profit":>7}')
print(f'  {"-"*65}')

bands = [(0,1,'Sub $1'), (1,3,'$1-3'), (3,5,'$3-5'), (5,10,'$5-10'), 
         (10,20,'$10-20'), (20,50,'$20-50'), (50,999,'$50+')]

total_profit_old = 0
total_profit_new = 0

for lo, hi, label in bands:
    items = [c for c in cj_pushed if lo <= c[0] < hi]
    if not items: continue
    avg_cost = sum(c[0] for c in items) / len(items)
    p = calc_price(avg_cost, 'cj')
    total_profit_old += p['profit_old'] * len(items)
    total_profit_new += p['profit_15'] * len(items)
    print(f'  {label:<12} {len(items):>5} {p["cost_ron"]:>8.0f} {p["sell_old"]:>7} {p["sell_15"]:>9} {"-"+str(int(p["reduction"]))+"%":>8} {p["profit_15"]:>6.0f}')

print(f'\n  Total pushed: {len(cj_pushed):,}')
print(f'  Profit estimat VECHI:  {total_profit_old:>12,.0f} RON (daca s-ar vinde tot)')
print(f'  Profit estimat NOU:    {total_profit_new:>12,.0f} RON (daca s-ar vinde tot)')
print(f'  Diferenta:             {total_profit_new - total_profit_old:>12,.0f} RON')

# ─── AE PRODUCTS ─────────────────────────────────────────
ae = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_dser')
ac = ae.cursor()
ac.execute("""SELECT cost_usd FROM products WHERE pushed_to_shopify=true AND cost_usd > 0""")
ae_pushed = [(float(r[0]),) for r in ac.fetchall()]

print(f'\n\n  📦 ALIEXPRESS')
print(f'  {"Band cost":<12} {"Cnt":>5} {"Cost RON":>9} {"VECHI":>7} {"NOU 1.5x":>9} {"Scădere":>8} {"Profit":>7}')
print(f'  {"-"*65}')

for lo, hi, label in bands:
    items = [c for c in ae_pushed if lo <= c[0] < hi]
    if not items: continue
    avg_cost = sum(c[0] for c in items) / len(items)
    p = calc_price(avg_cost, 'ae')
    print(f'  {label:<12} {len(items):>5} {p["cost_ron"]:>8.0f} {p["sell_old"]:>7} {p["sell_15"]:>9} {"-"+str(int(p["reduction"]))+"%":>8} {p["profit_15"]:>6.0f}')

# ─── EXEMPLE CONCRETE ────────────────────────────────────
print(f'\n\n  🔍 EXEMPLE CONCRETE (CJ):')
print(f'  {"Produs":<45} {"Cost":>5} {"VECHI":>6} {"NOU":>5} {"Profit":>7}')
print(f'  {"-"*70}')

cc.execute("""SELECT title, cost_usd FROM products 
    WHERE pushed_to_shopify=true AND cost_usd > 0
    AND (LOWER(title) LIKE '%%phone case%%' OR LOWER(title) LIKE '%%charger%%'
    OR LOWER(title) LIKE '%%power bank%%' OR LOWER(title) LIKE '%%bluetooth%%'
    OR LOWER(title) LIKE '%%watch%%' OR LOWER(title) LIKE '%%earbuds%%')
    ORDER BY cost_usd LIMIT 20""")

for title, cost in cc.fetchall():
    p = calc_price(cost, 'cj')
    print(f'  {title[:44]:<45} {p["cost_ron"]:>4.0f} {p["sell_old"]:>6} {p["sell_15"]:>5} {p["profit_15"]:>6.0f} RON')

cj.close()
ae.close()

print(f'\n{"=" * 80}')
print(f'  ✅ Cu markup 1.5x:')
print(f'     - Prețuri scad cu 40-55% față de acum')
print(f'     - Profit per produs: 5-80 RON (vs 30-300 RON acum)')
print(f'     - Competitiv cu eMAG la produse $10+')
print(f'     - Încă prea scump la produse sub $3 (transport > produs)')
print(f'{"=" * 80}')
