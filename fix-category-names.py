import psycopg2

conn = psycopg2.connect('postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require')
cur = conn.cursor()

# AliExpress category ID -> (English name, Romanian name)
NAME_MAP = {
    200000790: ('Tanks & Camis', 'Topuri & Maiouri'),
    201530602: ('Suits & Sets', 'Costume & Seturi'),
    201531701: ('Two-Piece Dresses', 'Rochii 2 Piese'),
    201241101: ('Wedding Dresses', 'Rochii Mireasă'),
    201531602: ('Matching Sets', 'Seturi Coordonate'),
    201531501: ('Bodysuits', 'Body-uri'),
    31203: ('Bras & Underwear', 'Lenjerie Intimă'),
    201517301: ('Plus Size Sets', 'Seturi Plus Size'),
    200001905: ('Jumpsuits', 'Salopete'),
    202224018: ('Y2K Dresses', 'Rochii Y2K'),
    100005793: ('Swimwear', 'Costume de Baie'),
    200000791: ('Tube Tops', 'Topuri Bandeau'),
    201713001: ('Co-ord Sets', 'Seturi Asortate'),
    31205: ('Nightwear', 'Lenjerie de Noapte'),
    200001901: ('Rompers', 'Salopete Scurte'),
    201303101: ('Knitwear Sets', 'Seturi Tricotate'),
    201239003: ('Formal Suits', 'Costume Elegante'),
    32004: ('Prom Dresses', 'Rochii Bal'),
    202220064: ('Streetwear Sets', 'Seturi Streetwear'),
    201303201: ('Loungewear Sets', 'Seturi Casual'),
    200001904: ('Overalls', 'Salopete Lungi'),
    201517501: ('Auto Accessories', 'Accesorii Auto'),
    200001914: ('Beach Cover-ups', 'Pareo Plajă'),
    200000848: ('Shapewear', 'Lenjerie Modelatoare'),
    200005118: ('Corsets', 'Corsete'),
    200000801: ('Bustiers', 'Bustiere'),
    200004279: ('Sleep Tops', 'Pijamale Top'),
    200001885: ('Mini Dresses', 'Rochii Mini'),
    200000361: ('Cocktail Dresses', 'Rochii Cocktail'),
    201235002: ('Blazer Sets', 'Seturi Blazer'),
    201237002: ('Pant Suits', 'Costume Pantalon'),
    201240203: ('Skirt Suits', 'Costume Fustă'),
    31201: ('Panties', 'Lenjerie'),
    100005788: ('Bikinis', 'Bikini'),
    200000855: ('Teddies', 'Lenjerie Sexy'),
    200000868: ('Babydolls', 'Babydoll'),
    200001913: ('Cover-ups', 'Acoperitoare'),
    201236303: ('Vest Suits', 'Costume Vestă'),
    201237511: ('Short Sets', 'Seturi Scurte'),
    201237805: ('Long Sets', 'Seturi Lungi'),
    200003927: ('Sleep Sets', 'Seturi Somn'),
    351: ('Socks', 'Șosete'),
    200003588: ('Thermal Underwear', 'Lenjerie Termică'),
    200001916: ('Sarongs', 'Sarong'),
    200001910: ('Kaftans', 'Kaftane'),
    200001907: ('Beach Pants', 'Pantaloni Plajă'),
    200001906: ('Beach Dresses', 'Rochii Plajă'),
    200001902: ('Playsuits', 'Playsuits'),
    200001886: ('Midi Dresses', 'Rochii Midi'),
    200001873: ('Maxi Dresses', 'Rochii Maxi'),
    200000828: ('Bralettes', 'Bralette'),
    200000351: ('Party Dresses', 'Rochii Party'),
    100005792: ('One-Piece Swimsuits', 'Costume Baie Întregi'),
    202220801: ('Casual Sets', 'Seturi Casual'),
    32003: ('Evening Dresses', 'Rochii Seară'),
    202240203: ('Trendy Sets', 'Seturi Trendy'),
}

updated = 0
for cat_id, (en_name, ro_name) in NAME_MAP.items():
    cur.execute(
        "UPDATE ae_categories SET name = %s, name_ro = %s WHERE ae_category_id = %s AND (name LIKE 'Sub %%' OR name LIKE 'Auto Sub %%')", 
        (en_name, ro_name, cat_id)
    )
    updated += cur.rowcount

conn.commit()
print(f'Updated {updated} category names')

# Verify top ones
cur.execute("SELECT ae_category_id, name, name_ro FROM ae_categories WHERE ae_category_id IN (200000790, 201530602, 201531701, 201241101, 201531602, 201531501, 31203)")
for r in cur.fetchall():
    print(f'  {r[0]}: {r[1]} -> {r[2]}')

conn.close()
