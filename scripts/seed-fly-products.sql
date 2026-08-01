-- Produse "Zbor spre X" legate de clipurile oficiale Swypik.
-- Fiecare postare = produs: clipul poartă product_refs -> marketplace_products.
-- Butonul "Vezi" din feed deschide oferta; pagina produsului duce la /fly?dest=IATA.
-- Idempotent.
BEGIN;

CREATE TEMP TABLE fly_seed (iata text, city text, title text, price_cents int, image text) ON COMMIT DROP;
INSERT INTO fly_seed VALUES
  ('ATH', 'Atena',     'Zbor spre Atena · Santorini ✈️',  19900, 'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=800&q=60'),
  ('BCN', 'Barcelona', 'Zbor spre Barcelona ✈️',           14900, 'https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=800&q=60'),
  ('CDG', 'Paris',     'Zbor spre Paris ✈️',               16900, 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=60'),
  ('FCO', 'Roma',      'Zbor spre Roma ✈️',                12900, 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=800&q=60'),
  ('LHR', 'Londra',    'Zbor spre Londra ✈️',              17900, 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=800&q=60'),
  ('AMS', 'Amsterdam', 'Zbor spre Amsterdam ✈️',           15900, 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?auto=format&fit=crop&w=800&q=60');

-- 1. Produsele (unice pe metadata->>'fly_iata')
INSERT INTO marketplace_products (title, description, price_cents, currency, image_url, listing_type, status, inventory_status, metadata)
SELECT
  s.title,
  'Preț "de la", dus, taxe incluse. Alegi data și rezervi direct pe Swypik Fly — fără redirecturi, plată securizată.',
  s.price_cents,
  'RON',
  s.image,
  'listing',
  'active',
  'in_stock',
  jsonb_build_object('vertical','fly','fly_iata',s.iata,'fly_city',s.city,'cta_url','/fly?dest='||s.iata,'rating',4.9)
FROM fly_seed s
WHERE NOT EXISTS (
  SELECT 1 FROM marketplace_products mp WHERE mp.metadata->>'fly_iata' = s.iata
);

-- 2. Leagă clipurile oficiale de produsele lor prin product_refs + tag video
UPDATE videos v
SET product_refs = jsonb_build_array(jsonb_build_object('product_id', mp.id::text, 'placement', 'official_fly')),
    updated_at = NOW()
FROM marketplace_products mp
WHERE v.creator_id = '00000000-0000-4000-9000-0000000f1c1a'
  AND mp.metadata->>'fly_iata' = v.metadata->>'iata'
  AND mp.metadata->>'vertical' = 'fly';

-- verificare
SELECT v.title AS video, mp.title AS produs, mp.price_cents, mp.metadata->>'cta_url' AS cta
FROM videos v
JOIN marketplace_products mp ON mp.id::text = v.product_refs->0->>'product_id'
WHERE v.creator_id = '00000000-0000-4000-9000-0000000f1c1a'
ORDER BY v.created_at;

COMMIT;
