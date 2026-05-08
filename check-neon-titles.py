import psycopg2

NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require'

conn = psycopg2.connect(NEON_URL)
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM products WHERE title_ro IS NOT NULL AND title_ro != ''")
total_ro = cur.fetchone()[0]
print(f'NeonDB titluri RO: {total_ro:,}/109,430')

print('\nExemple titluri RO din NeonDB:')
cur.execute("SELECT title, title_ro, cost_usd FROM products WHERE title_ro IS NOT NULL AND title_ro != '' ORDER BY RANDOM() LIMIT 10")
for en, ro, cost in cur.fetchall():
    print(f'  ${cost:>6} | {ro[:65]}')
    print(f'         | EN: {en[:55]}')
    print()

conn.close()
