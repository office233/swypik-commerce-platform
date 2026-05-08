import psycopg2
conn = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_cj')
cur = conn.cursor()

cur.execute("SELECT pg_size_pretty(pg_database_size('aicevrei_products_cj'))")
print(f'DB CJ Total:        {cur.fetchone()[0]}')

cur.execute("SELECT pg_size_pretty(pg_total_relation_size('products'))")
print(f'Tabel products:      {cur.fetchone()[0]}')

cur.execute("SELECT pg_size_pretty(pg_relation_size('products'))")
print(f'  Data:              {cur.fetchone()[0]}')

cur.execute("SELECT pg_size_pretty(pg_total_relation_size('products') - pg_relation_size('products'))")
print(f'  Indexes:           {cur.fetchone()[0]}')

cur.execute('SELECT COUNT(*) FROM products')
print(f'  Rows:              {cur.fetchone()[0]:,}')

cur.execute("SELECT pg_size_pretty(pg_database_size('aicevrei_products_dser'))")
print(f'\nDB AliExpress Total: {cur.fetchone()[0]}')

cur.execute("SELECT pg_size_pretty(pg_database_size('aicevrei_products_cj')::bigint + pg_database_size('aicevrei_products_dser')::bigint)")
print(f'TOTAL ambele DB:     {cur.fetchone()[0]}')

cur.close(); conn.close()
