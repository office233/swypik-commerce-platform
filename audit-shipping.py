import psycopg2

conn = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_cj')
cur = conn.cursor()

# Check what shipping data we have
print('=' * 70)
print('  🚚 AUDIT TRANSPORT — Ce date avem în DB?')
print('=' * 70)

# Check all columns
cur.execute("""SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name='products' ORDER BY ordinal_position""")
cols = cur.fetchall()
print('\n  Coloane tabel products:')
ship_cols = []
for c in cols:
    marker = ''
    if 'ship' in c[0].lower() or 'freight' in c[0].lower() or 'weight' in c[0].lower() or 'transport' in c[0].lower():
        marker = ' ← SHIPPING!'
        ship_cols.append(c[0])
    print(f'    {c[0]:<30} {c[1]:<20}{marker}')

# Check shipping columns data
if ship_cols:
    print(f'\n  📦 Date transport găsite:')
    for col in ship_cols:
        cur.execute(f"SELECT COUNT(*) FROM products WHERE {col} IS NOT NULL")
        cnt = cur.fetchone()[0]
        cur.execute(f"SELECT {col} FROM products WHERE {col} IS NOT NULL LIMIT 5")
        samples = [str(r[0]) for r in cur.fetchall()]
        print(f'    {col}: {cnt:,} non-null | Exemple: {", ".join(samples[:3])}')

# Check weight data
for col_name in ['weight', 'pack_weight', 'product_weight', 'gross_weight']:
    try:
        cur.execute(f"SELECT AVG({col_name}), MIN({col_name}), MAX({col_name}), COUNT(*) FROM products WHERE {col_name} IS NOT NULL AND {col_name} > 0")
        r = cur.fetchone()
        if r and r[3] > 0:
            print(f'\n  ⚖️  {col_name}: {r[3]:,} produse')
            print(f'      Min: {r[1]} | Avg: {r[0]:.2f} | Max: {r[2]}')
    except:
        conn.rollback()

# Check if we have any raw JSON data that might contain shipping
print('\n\n  🔍 Verificare câmpuri raw/JSON:')
for col_name in ['raw_data', 'extra_data', 'metadata', 'variants', 'properties']:
    try:
        cur.execute(f"SELECT COUNT(*) FROM products WHERE {col_name} IS NOT NULL")
        cnt = cur.fetchone()[0]
        if cnt > 0:
            cur.execute(f"SELECT {col_name} FROM products WHERE {col_name} IS NOT NULL LIMIT 1")
            sample = str(cur.fetchone()[0])[:200]
            print(f'    {col_name}: {cnt:,} rows | Sample: {sample}')
    except:
        conn.rollback()

conn.close()
