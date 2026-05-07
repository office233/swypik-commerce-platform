import psycopg2

print('=' * 60)
print('  COMPARATIE DIMENSIUNI PER PRODUS')
print('=' * 60)

# CJ
cj = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_cj')
cc = cj.cursor()
cc.execute("SELECT COUNT(*) FROM products")
cj_count = cc.fetchone()[0]
cc.execute("SELECT pg_relation_size('products')")
cj_size = cc.fetchone()[0]
cc.execute("SELECT AVG(LENGTH(title)) FROM products")
cj_title = cc.fetchone()[0] or 0
cc.execute("SELECT AVG(LENGTH(description)) FROM products WHERE description IS NOT NULL")
cj_desc = cc.fetchone()[0] or 0
cc.execute("SELECT COUNT(*) FROM products WHERE description IS NOT NULL")
cj_desc_count = cc.fetchone()[0]
cc.execute("SELECT AVG(LENGTH(main_image)) FROM products")
cj_img = cc.fetchone()[0] or 0
cc.execute("SELECT AVG(array_length(images, 1)) FROM products WHERE images IS NOT NULL")
cj_imgs = cc.fetchone()[0] or 0

print(f'\n  CJ ({cj_count:,} produse, {cj_size/1024/1024:.0f} MB)')
print(f'    Per produs:     {cj_size/cj_count:.0f} bytes')
print(f'    Avg titlu:      {cj_title:.0f} chars')
print(f'    Cu descriere:   {cj_desc_count:,} ({cj_desc:.0f} chars avg)')
print(f'    Avg imagini:    {cj_imgs:.1f} per produs')
cj.close()

# AE
ae = psycopg2.connect(host='localhost', user='postgres', password='postgres', dbname='aicevrei_products_dser')
ac = ae.cursor()
ac.execute("SELECT COUNT(*) FROM products")
ae_count = ac.fetchone()[0]
ac.execute("SELECT pg_relation_size('products')")
ae_size = ac.fetchone()[0]
ac.execute("SELECT AVG(LENGTH(title)) FROM products")
ae_title = ac.fetchone()[0] or 0
ac.execute("SELECT AVG(LENGTH(description)) FROM products WHERE description IS NOT NULL")
ae_desc = ac.fetchone()[0] or 0
ac.execute("SELECT COUNT(*) FROM products WHERE description IS NOT NULL")
ae_desc_count = ac.fetchone()[0]
ac.execute("SELECT AVG(LENGTH(main_image)) FROM products")
ae_img = ac.fetchone()[0] or 0
ac.execute("SELECT AVG(image_count) FROM products")
ae_imgs = ac.fetchone()[0] or 0

# Check for large text columns
ac.execute("SELECT AVG(LENGTH(aliexpress_url)) FROM products WHERE aliexpress_url IS NOT NULL")
ae_url = ac.fetchone()[0] or 0

# Check all column sizes
ac.execute("""SELECT 
    pg_size_pretty(SUM(pg_column_size(title))) as titles,
    pg_size_pretty(SUM(pg_column_size(description))) as descs,
    pg_size_pretty(SUM(pg_column_size(main_image))) as imgs,
    pg_size_pretty(SUM(pg_column_size(aliexpress_url))) as urls
FROM products""")
r = ac.fetchone()

print(f'\n  AliExpress ({ae_count:,} produse, {ae_size/1024/1024:.0f} MB)')
print(f'    Per produs:     {ae_size/ae_count:.0f} bytes')
print(f'    Avg titlu:      {ae_title:.0f} chars')
print(f'    Cu descriere:   {ae_desc_count:,} ({ae_desc:.0f} chars avg)')
print(f'    Avg imagini:    {ae_imgs:.1f} per produs')
print(f'    Avg URL:        {ae_url:.0f} chars')
print(f'\n    Dimensiune pe coloane:')
print(f'      Titluri:      {r[0]}')
print(f'      Descrieri:    {r[1]}')
print(f'      Imagini URL:  {r[2]}')
print(f'      AE URLs:      {r[3]}')

ae.close()
print('=' * 60)
