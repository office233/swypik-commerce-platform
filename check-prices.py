import psycopg2
conn = psycopg2.connect('postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require')
cur = conn.cursor()
cur.execute("""SELECT weight_band, cheapest_total_usd, cheapest_shipping_usd,
    COALESCE(cheapest_total_usd, cheapest_shipping_usd, '10') as rate 
    FROM shipping_rates WHERE country_code = 'RO' ORDER BY weight_band""")
print("RO Shipping Rates (NeonDB):")
for r in cur.fetchall():
    print(f"  {r[0]:>10} | total_usd={r[1]} | ship_usd={r[2]} | USED rate={r[3]}")

# Now calculate what the site should show
print("\nPrice calculation with REAL rates:")
USD = 4.55
VAT = 0.19
rates = {}
cur.execute("""SELECT weight_band, COALESCE(cheapest_total_usd, cheapest_shipping_usd, '10') as rate 
    FROM shipping_rates WHERE country_code = 'RO'""")
for r in cur.fetchall():
    rates[r[0]] = float(r[1])

default_ship = rates.get('200-500', 10)
ship = rates.get('100-200', default_ship)
print(f"  100-200 band ship rate: ${ship}")

tests = [(0.66, 189), (2.22, 199), (7.76, 199), (6.88, 189), (0.97, 129)]
print(f"\n  cost$ | ship$ | totalRON | mk  | rawPrice | newPrice | LIVE | OK?")
for cost, live in tests:
    totalRon = (cost + ship) * USD * (1 + VAT)
    mk = 2.0 if cost < 3 else (1.5 if cost < 50 else 1.3)
    raw = totalRon * mk
    pts = [14,19,24,29,39,49,59,69,79,89,99,119,129,149,169,189,199,219,249]
    sp = next((p for p in pts if p >= raw), int(raw/100)*100+99)
    minP = int(totalRon * 1.2) + 1
    if sp < minP:
        sp = next((p for p in pts if p >= totalRon * 1.3), int(totalRon*1.3/10)*10+9)
    ok = "✅" if abs(sp - live) < 5 else "❌"
    print(f"  ${cost:>5} | ${ship} | {totalRon:>7.0f}  | {mk}x | {raw:>8.0f}  | {sp:>8} | {live:>4} | {ok}")

conn.close()
