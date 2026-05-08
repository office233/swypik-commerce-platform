import psycopg2

print('=' * 70)
print('  AUDIT TITLURI PRODUSE')
print('=' * 70)

# CJ DB
cj = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_cj')
cur = cj.cursor()

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name LIKE '%title%' ORDER BY ordinal_position")
cols = [c[0] for c in cur.fetchall()]
print(f'\n  CJ DB — Coloane titlu: {cols}')

cur.execute("SELECT COUNT(*) FROM products")
total = cur.fetchone()[0]

for col in cols:
    cur.execute(f"SELECT COUNT(*) FROM products WHERE {col} IS NOT NULL AND {col} != ''")
    filled = cur.fetchone()[0]
    print(f'    {col}: {filled:,}/{total:,} ({filled/total*100:.1f}%)')

print(f'\n  Exemple (EN vs RO):')
if 'title_ro' in cols:
    cur.execute("SELECT title, title_ro FROM products WHERE cost_usd > 0 LIMIT 10")
    for title, title_ro in cur.fetchall():
        ro = (title_ro or 'NULL')[:50]
        print(f'    EN: {title[:55]}')
        print(f'    RO: {ro}')
        print()
else:
    cur.execute("SELECT title FROM products WHERE cost_usd > 0 LIMIT 10")
    for (title,) in cur.fetchall():
        print(f'    {title[:70]}')
    print(f'\n  ⚠️  Coloana title_ro NU EXISTA!')

cj.close()

# AE DB
print('\n' + '-' * 70)
ae = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_dser')
cur2 = ae.cursor()

cur2.execute("SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name LIKE '%title%'")
ae_cols = [c[0] for c in cur2.fetchall()]
print(f'  AE DB — Coloane titlu: {ae_cols}')

cur2.execute("SELECT COUNT(*) FROM products")
ae_total = cur2.fetchone()[0]

for col in ae_cols:
    try:
        cur2.execute(f"SELECT COUNT(*) FROM products WHERE {col} IS NOT NULL AND {col} != ''")
        filled = cur2.fetchone()[0]
        print(f'    {col}: {filled:,}/{ae_total:,} ({filled/ae_total*100:.1f}%)')
    except:
        ae.rollback()

ae.close()
print('=' * 70)
