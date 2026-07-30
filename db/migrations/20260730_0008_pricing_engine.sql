-- ─────────────────────────────────────────────────────────────────────────────
-- 20260730_0008_pricing_engine.sql
-- FRONT R3 — Pricing Engine: zone de tarifare + reguli surge.
--
-- 1. pricing_zones  — tarife per (city, kind, vehicle_class)
-- 2. surge_rules    — multiplicatori manuali/automatici per zonă
-- 3. Seed București — valori ESTIMATE pe baza pieței RO iulie 2026
--    (referință publică: tarife Glovo/Tazz/Bolt/Uber București — estimări, nu date oficiale)
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. pricing_zones
CREATE TABLE IF NOT EXISTS pricing_zones (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city                    text NOT NULL,
  country                 char(2) NOT NULL DEFAULT 'RO',
  kind                    text NOT NULL CHECK (kind IN ('delivery','ride','errand')),
  vehicle_class           text NOT NULL CHECK (vehicle_class IN ('economy','comfort','van','bike','car')),
  base_cents              integer NOT NULL CHECK (base_cents >= 0),
  per_km_cents            integer NOT NULL CHECK (per_km_cents >= 0),
  per_min_cents           integer NOT NULL CHECK (per_min_cents >= 0),
  min_fare_cents          integer NOT NULL CHECK (min_fare_cents >= 0),
  booking_fee_cents       integer NOT NULL DEFAULT 0 CHECK (booking_fee_cents >= 0),
  cancel_fee_cents        integer NOT NULL DEFAULT 0 CHECK (cancel_fee_cents >= 0),
  platform_commission_pct numeric(5,2) NOT NULL CHECK (platform_commission_pct >= 0 AND platform_commission_pct <= 100),
  courier_share_pct       numeric(5,2) NOT NULL CHECK (courier_share_pct >= 0 AND courier_share_pct <= 100),
  currency                char(3) NOT NULL DEFAULT 'RON',
  active                  boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city, kind, vehicle_class)
);

CREATE INDEX IF NOT EXISTS idx_pricing_zones_city_kind_active
  ON pricing_zones (city, kind, active);

-- 2. surge_rules
CREATE TABLE IF NOT EXISTS surge_rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id    uuid NOT NULL REFERENCES pricing_zones(id) ON DELETE CASCADE,
  multiplier numeric(3,2) NOT NULL CHECK (multiplier >= 1.00 AND multiplier <= 5.00),
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  auto       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_surge_rules_zone_window
  ON surge_rules (zone_id, starts_at, ends_at);

-- 3. Seed București — valori ESTIMATE piață RO (RON, în bani/cents).
--    Sursă: estimări proprii pe baza tarifelor publice Glovo/Tazz (delivery)
--    și Bolt/Uber (ride) București, iulie 2026. NU sunt date oficiale.
INSERT INTO pricing_zones
  (city, country, kind, vehicle_class, base_cents, per_km_cents, per_min_cents,
   min_fare_cents, booking_fee_cents, cancel_fee_cents,
   platform_commission_pct, courier_share_pct, currency, active)
VALUES
  -- delivery bike: pornire 4.00, 1.50/km, 0.10/min, minim 6.00, booking 1.00
  ('București','RO','delivery','bike',   400, 150,  10,  600, 100,   0, 25.00, 75.00, 'RON', true),
  -- delivery car:  pornire 5.00, 2.00/km, 0.15/min, minim 8.00, booking 1.00
  ('București','RO','delivery','car',    500, 200,  15,  800, 100,   0, 25.00, 75.00, 'RON', true),
  -- ride economy: pornire 5.00, 2.20/km, 0.40/min, minim 10.00, anulare 7.00
  ('București','RO','ride','economy',    500, 220,  40, 1000,   0, 700, 20.00, 80.00, 'RON', true),
  -- ride comfort: pornire 7.00, 2.90/km, 0.55/min, minim 13.00, anulare 9.00
  ('București','RO','ride','comfort',    700, 290,  55, 1300,   0, 900, 20.00, 80.00, 'RON', true),
  -- ride van:     pornire 9.00, 3.50/km, 0.70/min, minim 17.00, anulare 12.00
  ('București','RO','ride','van',        900, 350,  70, 1700,   0, 1200, 20.00, 80.00, 'RON', true)
ON CONFLICT (city, kind, vehicle_class) DO NOTHING;
