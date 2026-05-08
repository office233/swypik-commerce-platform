import psycopg2

NEON = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require'
USD = 4.55
VAT = 0.19

conn = psycopg2.connect(NEON)
cur = conn.cursor()

# Get CORRECT shipping rates (cheapest_shipping_usd)
cur.execute("""SELECT weight_band, COALESCE(cheapest_shipping_usd, '5') as rate 
    FROM shipping_rates WHERE country_code = 'RO'""")
rates = {'0-50': 4.0}
for wb, rate in cur.fetchall():
    rates[wb] = float(rate)

print("Shipping rates (CORECT - doar transport):")
for k, v in sorted(rates.items()):
    print(f"  {k:>10}: ${v:.2f}")

def calc_price(cost, ship):
    total_ron = (cost + ship) * USD * (1 + VAT)
    mk = 2.0 if cost < 3 else (1.5 if cost < 50 else 1.3)
    raw = total_ron * mk
    pts = [14,19,24,29,39,49,59,69,79,89,99,119,129,149,169,189,199,219,249,269,299,349,399,449,499,599,699,799,899,999]
    sp = next((p for p in pts if p >= raw), int(raw/100)*100+99)
    minP = int(total_ron * 1.2) + 1
    if sp < minP:
        sp = next((p for p in pts if p >= total_ron * 1.3), int(total_ron*1.3/10)*10+9)
    return sp

# Sample 5000 products
cur.execute("SELECT cost_usd, weight_band FROM products WHERE cost_usd > 0 LIMIT 5000")
all_prods = cur.fetchall()

prices = []
for cost, wb in all_prods:
    cost = float(cost)
    ship = rates.get(wb, rates.get('200-500', 5))
    prices.append(calc_price(cost, ship))

ranges = [
    (0, 29, "Sub 29 RON"),
    (29, 49, "29-49 RON"),
    (49, 79, "49-79 RON"),
    (79, 99, "79-99 RON"),
    (99, 149, "99-149 RON"),
    (149, 199, "149-199 RON"),
    (199, 299, "199-299 RON"),
    (299, 999, "299-999 RON"),
]

print(f"\n{'='*75}")
print(f"  NOUA DISTRIBUȚIE PREȚURI (cu shipping corect)")
print(f"{'='*75}")

for lo, hi, label in ranges:
    cnt = sum(1 for p in prices if lo <= p < hi)
    pct = cnt / len(prices) * 100
    bar = "█" * int(pct / 2)
    print(f"  {label:>15} | {cnt:>5} | {pct:>5.1f}% | {bar}")

avg = sum(prices) / len(prices)
print(f"\n  Preț mediu: {avg:.0f} RON (înainte: 179 RON)")
print(f"  Sub 100 RON: {sum(1 for p in prices if p < 100) / len(prices) * 100:.1f}%")
print(f"  Sub 150 RON: {sum(1 for p in prices if p < 150) / len(prices) * 100:.1f}%")

# Exemple concrete
print(f"\n  Exemple prețuri noi:")
cur.execute("SELECT cost_usd, weight_band, title_ro FROM products WHERE cost_usd > 0 ORDER BY RANDOM() LIMIT 10")
for cost, wb, title in cur.fetchall():
    cost = float(cost)
    ship = rates.get(wb, 5)
    p = calc_price(cost, ship)
    t = (title or "")[:40]
    print(f"  ${cost:>5.2f} + ${ship:.1f} ship → {p:>4} RON | {t}")

conn.close()
