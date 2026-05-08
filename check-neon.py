import psycopg2

NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require'

conn = psycopg2.connect(NEON_URL)
cur = conn.cursor()

cur.execute('SELECT COUNT(*) FROM products')
total = cur.fetchone()[0]

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='title_ro'")
has_ro = cur.fetchone()

ro_count = 0
if has_ro:
    cur.execute("SELECT COUNT(*) FROM products WHERE title_ro IS NOT NULL AND title_ro != ''")
    ro_count = cur.fetchone()[0]

print(f'NeonDB: {total:,} produse | title_ro existe: {bool(has_ro)} | completate: {ro_count:,}')

cur.execute('SELECT title, title_ro FROM products LIMIT 3')
for t, tro in cur.fetchall():
    print(f'  EN: {(t or "")[:50]}')
    print(f'  RO: {tro}')
    print()

conn.close()
