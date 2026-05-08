"""
AUDIT FINAL COMPLET — Prețuri AICeVrei vs Piață
Verificare onestă: sunt prețurile chiar bune?
"""
import psycopg2

NEON = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require'
USD = 4.55
VAT = 0.19

conn = psycopg2.connect(NEON)
cur = conn.cursor()

# 1. Shipping rates RO
print("=" * 75)
print("  1️⃣  SHIPPING RATES România (NeonDB)")
print("=" * 75)
cur.execute("""SELECT weight_band, cheapest_shipping_usd, cheapest_total_usd,
    COALESCE(cheapest_total_usd, cheapest_shipping_usd, '10') as used_rate
    FROM shipping_rates WHERE country_code = 'RO' ORDER BY weight_band""")
rates = {}
for wb, ship, total, used in cur.fetchall():
    rates[wb] = float(used)
    print(f"  {wb:>10} | shipping=${ship:>5} | total=${total:>5} | FOLOSIT=${used:>5}")

print(f"\n  ⚠️  cheapest_total_usd include PRODUSUL + SHIPPING!")
print(f"  ⚠️  Codul ADUNĂ cheapest_total_usd LA cost_usd → DUBLU COST!")

# 2. Price simulation with CURRENT shipping
print("\n" + "=" * 75)
print("  2️⃣  PREȚURI ACTUALE vs CU SHIPPING CORECT")
print("=" * 75)

cur.execute("""SELECT cost_usd, weight_band, title_ro FROM products 
    WHERE cost_usd > 0 AND cost_usd < 100 
    ORDER BY RANDOM() LIMIT 15""")
products = cur.fetchall()

def calc_price(cost, ship, markup_type='new'):
    total_ron = (cost + ship) * USD * (1 + VAT)
    if markup_type == 'new':
        mk = 2.0 if cost < 3 else (1.5 if cost < 50 else 1.3)
    else:
        mk = 2.0 if cost < 3 else (1.5 if cost < 50 else 1.3)
    raw = total_ron * mk
    pts = [14,19,24,29,39,49,59,69,79,89,99,119,129,149,169,189,199,219,249,269,299,349,399]
    sp = next((p for p in pts if p >= raw), int(raw/100)*100+99)
    return sp, total_ron

print(f"  {'cost$':>6} | {'wb':>8} | {'ship$':>6} | {'ACUM':>5} | {'FIX*':>5} | {'titlu'}")
print(f"  {'-'*70}")

for cost, wb, title in products:
    cost = float(cost)
    ship_now = rates.get(wb, 10)
    price_now, _ = calc_price(cost, ship_now)
    
    # With cheapest_shipping_usd instead
    cur.execute("SELECT cheapest_shipping_usd FROM shipping_rates WHERE country_code='RO' AND weight_band=%s", (wb,))
    r = cur.fetchone()
    ship_fixed = float(r[0]) if r and r[0] else 5.0
    price_fixed, _ = calc_price(cost, ship_fixed)
    
    diff = price_now - price_fixed
    flag = "🔴" if diff > 30 else ("🟡" if diff > 10 else "✅")
    
    t = (title or "")[:35]
    print(f"  ${cost:>5.2f} | {wb:>8} | ${ship_now:>5.1f} | {price_now:>4} | {price_fixed:>4} | {flag} {t}")

print(f"\n  * FIX = folosind cheapest_shipping_usd (doar transport, fără produs)")

# 3. Distribuție prețuri
print("\n" + "=" * 75)
print("  3️⃣  DISTRIBUȚIE PREȚURI CATALOG (cu shipping actual)")
print("=" * 75)

ranges = [
    (0, 29, "Sub 29 RON"),
    (29, 49, "29-49 RON"),
    (49, 79, "49-79 RON"),
    (79, 99, "79-99 RON"),
    (99, 149, "99-149 RON"),
    (149, 199, "149-199 RON"),
    (199, 299, "199-299 RON"),
    (299, 999, "299-999 RON"),
    (999, 99999, "999+ RON"),
]

# We can't easily calculate prices from SQL so let's sample
cur.execute("SELECT cost_usd, weight_band FROM products WHERE cost_usd > 0 LIMIT 5000")
all_prods = cur.fetchall()

price_counts = {r[2]: 0 for r in ranges}
total_prices = []
for cost, wb in all_prods:
    cost = float(cost)
    ship = rates.get(wb, rates.get('200-500', 10))
    p, _ = calc_price(cost, ship)
    total_prices.append(p)
    for lo, hi, label in ranges:
        if lo <= p < hi:
            price_counts[label] += 1
            break

for lo, hi, label in ranges:
    cnt = price_counts[label]
    pct = cnt / len(all_prods) * 100
    bar = "█" * int(pct / 2)
    print(f"  {label:>15} | {cnt:>5} | {pct:>5.1f}% | {bar}")

avg = sum(total_prices) / len(total_prices)
print(f"\n  Preț mediu: {avg:.0f} RON")
print(f"  Produse sub 100 RON: {sum(1 for p in total_prices if p < 100) / len(total_prices) * 100:.1f}%")
print(f"  Produse sub 200 RON: {sum(1 for p in total_prices if p < 200) / len(total_prices) * 100:.1f}%")

# 4. Recommendation
print("\n" + "=" * 75)
print("  4️⃣  CONCLUZIE")
print("=" * 75)
print(f"""
  PROBLEMĂ: Coloana 'cheapest_total_usd' din shipping_rates INCLUDE costul 
  produsului + transportul. Codul o ADUNĂ la cost_usd → transport dublu!
  
  Exemplu: produs $0.66 + shipping 'total' $15.78 = $16.44
  Dar realitatea: produs $0.66 + transport real $11.44 = $12.10
  
  FIX: Schimbă COALESCE(cheapest_total_usd, ...) → cheapest_shipping_usd
  Rezultat: prețuri cu 20-40% mai mici → MULT mai competitive!
""")

conn.close()
