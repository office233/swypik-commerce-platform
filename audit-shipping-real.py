import psycopg2

conn = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_cj')
cur = conn.cursor()

print('=' * 70)
print('  🚚 ANALIZA TRANSPORT CJ — Bazat pe weight_band')
print('=' * 70)

# Weight band distribution
cur.execute("""SELECT weight_band, COUNT(*) as cnt 
    FROM products GROUP BY weight_band ORDER BY cnt DESC""")
bands = cur.fetchall()

print('\n  Distributie greutate:')
for band, cnt in bands:
    pct = cnt / 109430 * 100
    bar = '█' * int(pct / 2)
    print(f'    {str(band):<15} {cnt:>7,} ({pct:>5.1f}%) {bar}')

# CJ Shipping rates (estimated by weight to Romania/EU)
# Based on CJ official shipping calculator
# CJ uses ePacket, Yanwen, CJ Packet for most items
print('\n\n  📦 CJ Shipping Rates to Romania (estimate):')
print('  ' + '-' * 55)

cj_rates = {
    'Sub 100g':     {'cj_packet': 2.50, 'epacket': 3.00, 'yanwen': 2.80},
    '100-200':      {'cj_packet': 3.00, 'epacket': 3.50, 'yanwen': 3.20},
    '200-500':      {'cj_packet': 4.00, 'epacket': 5.00, 'yanwen': 4.50},
    '500-1000':     {'cj_packet': 5.50, 'epacket': 7.00, 'yanwen': 6.00},
    '1000-2000':    {'cj_packet': 8.00, 'epacket': 10.00, 'yanwen': 9.00},
    '2000+':        {'cj_packet': 12.00, 'epacket': 15.00, 'yanwen': 13.00},
}

print(f'    {"Band":<15} {"CJ Packet":>10} {"ePacket":>10} {"Yanwen":>10}')
for band, rates in cj_rates.items():
    print(f'    {band:<15} ${rates["cj_packet"]:>8.2f} ${rates["epacket"]:>8.2f} ${rates["yanwen"]:>8.2f}')

# Map our weight_bands to shipping costs
print('\n\n  💰 IMPACT PE PRICING — Transport REAL vs Estimat:')
print(f'  {"Weight Band":<15} {"Cnt":>7} {"Ship Est":>9} {"Ship Real":>10} {"Diferenta":>10}')
print(f'  {"-"*55}')

band_mapping = {
    'Sub 100': 3.00,
    '100-200': 3.50,
    '200-500': 4.50,
    '500-1000': 6.50,
    '1000-2000': 9.50,
    '2000+': 14.00,
    None: 4.50,  # unknown, assume medium
}

for wb, cnt in bands:
    wb_key = str(wb) if wb else None
    real_ship = band_mapping.get(wb_key, 4.50)
    
    # Get avg cost for this band
    if wb:
        cur.execute("SELECT AVG(cost_usd) FROM products WHERE weight_band=%s AND cost_usd > 0", (wb,))
    else:
        cur.execute("SELECT AVG(cost_usd) FROM products WHERE weight_band IS NULL AND cost_usd > 0")
    avg_cost = float(cur.fetchone()[0] or 5)
    
    # Our estimated shipping
    est_ship = 3 if avg_cost < 5 else (5 if avg_cost < 20 else (8 if avg_cost < 50 else 10))
    
    diff = real_ship - est_ship
    marker = '⚠️ SUBEST!' if diff > 1 else ('✅' if abs(diff) <= 1 else '💰 OVEREST')
    
    print(f'  {str(wb):<15} {cnt:>7,}    ${est_ship:<6}   ${real_ship:<7.2f}   {diff:>+6.2f} {marker}')

# Recalculate pricing with REAL shipping
print('\n\n  📊 PRICING CU TRANSPORT REAL (1.5x markup):')
print(f'  {"Weight Band":<12} {"Cost $":>7} {"Ship $":>7} {"Total RON":>10} {"x1.5":>7} {"Profit":>7}')
print(f'  {"-"*55}')

for wb, cnt in bands:
    wb_key = str(wb) if wb else None
    real_ship = band_mapping.get(wb_key, 4.50)
    
    if wb:
        cur.execute("SELECT AVG(cost_usd) FROM products WHERE weight_band=%s AND cost_usd > 0", (wb,))
    else:
        cur.execute("SELECT AVG(cost_usd) FROM products WHERE weight_band IS NULL AND cost_usd > 0")
    avg_cost = float(cur.fetchone()[0] or 5)
    
    total_ron = (avg_cost + real_ship) * 4.5
    sell = total_ron * 1.5
    profit = sell - total_ron
    
    print(f'  {str(wb):<12} ${avg_cost:>6.2f} ${real_ship:>6.2f} {total_ron:>9.0f} RON {sell:>6.0f} {profit:>6.0f} RON')

conn.close()
print('=' * 70)
