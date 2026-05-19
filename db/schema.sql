--
-- PostgreSQL database dump
--

\restrict 4OyKrczoWmzfW3L249il4h2UnZwwwYeATwfuhpNWjwKBktqH4DFCzQWtjxztsEY

-- Dumped from database version 16.14 (Debian 16.14-1.pgdg12+1)
-- Dumped by pg_dump version 16.14 (Debian 16.14-1.pgdg12+1)


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: apply_user_strike(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_user_strike() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  new_score      numeric(8,2);
  suspend_until  timestamptz := NULL;
  suspend_reason text := NULL;
BEGIN
  -- Default expiry: 90 days for blocked/adult, 30 days for sensitive/spam.
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.created_at + CASE
      WHEN NEW.label IN ('blocked','adult') THEN INTERVAL '90 days'
      ELSE INTERVAL '30 days'
    END;
  END IF;

  -- Upsert running totals.
  INSERT INTO user_risk_scores (
    user_id, score, strike_count, blocked_count, adult_count, sensitive_count,
    last_strike_at, computed_at
  )
  VALUES (
    NEW.user_id,
    NEW.severity,
    1,
    CASE WHEN NEW.label = 'blocked'  THEN 1 ELSE 0 END,
    CASE WHEN NEW.label = 'adult'    THEN 1 ELSE 0 END,
    CASE WHEN NEW.label = 'sensitive' THEN 1 ELSE 0 END,
    NEW.created_at,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET score           = user_risk_scores.score + NEW.severity,
        strike_count    = user_risk_scores.strike_count + 1,
        blocked_count   = user_risk_scores.blocked_count
                          + CASE WHEN NEW.label = 'blocked'   THEN 1 ELSE 0 END,
        adult_count     = user_risk_scores.adult_count
                          + CASE WHEN NEW.label = 'adult'     THEN 1 ELSE 0 END,
        sensitive_count = user_risk_scores.sensitive_count
                          + CASE WHEN NEW.label = 'sensitive' THEN 1 ELSE 0 END,
        last_strike_at  = NEW.created_at,
        computed_at     = now()
    RETURNING score INTO new_score;

  IF new_score IS NULL THEN
    SELECT score INTO new_score FROM user_risk_scores WHERE user_id = NEW.user_id;
  END IF;

  -- Decide suspension window.
  IF new_score >= 40 THEN
    suspend_until  := now() + INTERVAL '365 days';
    suspend_reason := format('auto_strike score=%s (>=40 — long-term)', new_score);
  ELSIF new_score >= 20 THEN
    suspend_until  := now() + INTERVAL '30 days';
    suspend_reason := format('auto_strike score=%s (>=20)', new_score);
  ELSIF new_score >= 10 THEN
    suspend_until  := now() + INTERVAL '7 days';
    suspend_reason := format('auto_strike score=%s (>=10)', new_score);
  END IF;

  IF suspend_until IS NOT NULL THEN
    UPDATE users
       SET status            = 'suspended',
           suspended_until   = GREATEST(COALESCE(suspended_until, now()), suspend_until),
           suspension_reason = suspend_reason
     WHERE id = NEW.user_id
       AND status <> 'deleted';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: auto_create_safety_label(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_create_safety_label() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO product_safety_labels (
    product_id, label, classifier_version, reasons, signals
  ) VALUES (
    NEW.id,
    'sensitive',
    'auto_pending',
    ARRAY['pending_classification']::text[],
    '{"pending": true}'::jsonb
  )
  ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: auto_create_video_safety_label(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_create_video_safety_label() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO video_safety_labels (
    video_id, label, classifier_version, reasons, signals
  ) VALUES (
    NEW.id,
    'sensitive',
    'auto_pending',
    ARRAY['pending_classification']::text[],
    '{"pending": true}'::jsonb
  )
  ON CONFLICT (video_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: daily_missions_assign(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.daily_missions_assign(p_user_id uuid, p_count integer DEFAULT 4) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Bucharest')::date;
  v_existing integer;
  v_inserted integer := 0;
  v_level integer;
BEGIN
  INSERT INTO user_wallets(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT level INTO v_level FROM user_wallets WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_existing FROM user_daily_missions WHERE user_id = p_user_id AND day = v_today;
  IF v_existing >= p_count THEN RETURN 0; END IF;

  INSERT INTO user_daily_missions(user_id, template_id, day, target, reward_xp, reward_coins, reward_reputation)
  SELECT p_user_id, t.id, v_today, t.target, t.reward_xp, t.reward_coins, t.reward_reputation
    FROM daily_mission_templates t
   WHERE t.is_active = TRUE
     AND t.min_level <= COALESCE(v_level, 1)
     AND NOT EXISTS (
       SELECT 1 FROM user_daily_missions u
        WHERE u.user_id = p_user_id AND u.day = v_today AND u.template_id = t.id
     )
   ORDER BY random() * t.weight DESC
   LIMIT GREATEST(p_count - v_existing, 0);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END $$;


--
-- Name: daily_missions_progress(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.daily_missions_progress(p_user_id uuid, p_kind text, p_amount integer DEFAULT 1) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Bucharest')::date;
  v_completed_count integer;
BEGIN
  WITH updated AS (
    UPDATE user_daily_missions m
       SET progress = LEAST(target, progress + p_amount),
           completed_at = CASE WHEN completed_at IS NULL AND (progress + p_amount) >= target THEN now() ELSE completed_at END
      FROM daily_mission_templates t
     WHERE m.template_id = t.id
       AND m.user_id = p_user_id
       AND m.day = v_today
       AND m.completed_at IS NULL
       AND t.kind = p_kind
    RETURNING m.id, m.completed_at
  )
  SELECT COUNT(*) INTO v_completed_count FROM updated WHERE completed_at IS NOT NULL;

  -- Emit a notification for each freshly completed mission.
  INSERT INTO notifications(user_id, kind, title, body, ref_type, ref_id, cta_url)
  SELECT p_user_id, 'mission_complete', 'Misiune completă',
         t.title || ' — revendică recompensa.', 'mission', m.id, '/missions/daily'
    FROM user_daily_missions m
    JOIN daily_mission_templates t ON t.id = m.template_id
   WHERE m.user_id = p_user_id
     AND m.day = v_today
     AND m.completed_at IS NOT NULL
     AND m.claimed_at IS NULL
     AND m.completed_at > now() - interval '5 seconds';

  RETURN COALESCE(v_completed_count, 0);
END $$;


--
-- Name: decay_user_strikes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decay_user_strikes() RETURNS TABLE(expired integer, recomputed integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_expired   int := 0;
  v_recomp    int := 0;
BEGIN
  WITH up AS (
    UPDATE user_strikes
       SET status = 'expired'
     WHERE status = 'active'
       AND expires_at IS NOT NULL
       AND expires_at <= now()
    RETURNING user_id
  )
  SELECT COUNT(*) INTO v_expired FROM up;

  -- Recompute aggregates for every user that has at least one expired/revoked
  -- strike, plus active ones.
  WITH agg AS (
    SELECT user_id,
           COALESCE(SUM(severity) FILTER (WHERE status = 'active'), 0)::numeric(8,2) AS score,
           COUNT(*)                  AS strike_count,
           COUNT(*) FILTER (WHERE status='active' AND label='blocked')   AS blocked_count,
           COUNT(*) FILTER (WHERE status='active' AND label='adult')     AS adult_count,
           COUNT(*) FILTER (WHERE status='active' AND label='sensitive') AS sensitive_count,
           MAX(created_at) FILTER (WHERE status='active')                AS last_strike_at
      FROM user_strikes
     GROUP BY user_id
  )
  INSERT INTO user_risk_scores
    (user_id, score, strike_count, blocked_count, adult_count, sensitive_count,
     last_strike_at, last_decay_at, computed_at)
  SELECT user_id, score, strike_count, blocked_count, adult_count, sensitive_count,
         last_strike_at, now(), now()
    FROM agg
  ON CONFLICT (user_id) DO UPDATE
    SET score           = EXCLUDED.score,
        strike_count    = EXCLUDED.strike_count,
        blocked_count   = EXCLUDED.blocked_count,
        adult_count     = EXCLUDED.adult_count,
        sensitive_count = EXCLUDED.sensitive_count,
        last_strike_at  = EXCLUDED.last_strike_at,
        last_decay_at   = now(),
        computed_at     = now();

  GET DIAGNOSTICS v_recomp = ROW_COUNT;

  -- Auto-lift suspensions that expired naturally.
  UPDATE users
     SET status            = 'active',
         suspended_until   = NULL,
         suspension_reason = NULL
   WHERE status = 'suspended'
     AND suspended_until IS NOT NULL
     AND suspended_until <= now();

  RETURN QUERY SELECT v_expired, v_recomp;
END;
$$;


--
-- Name: f_unaccent(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.f_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $_$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $_$;


--
-- Name: fn_referral_attr_bump_counters(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_referral_attr_bump_counters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE referral_codes
       SET total_invited = total_invited + 1, updated_at = now()
     WHERE user_id = NEW.referrer_user_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.validated_at IS NOT NULL AND OLD.validated_at IS NULL THEN
    UPDATE referral_codes
       SET total_validated = total_validated + 1, updated_at = now()
     WHERE user_id = NEW.referrer_user_id;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_reward_events_credit_wallet(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_reward_events_credit_wallet() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Only credit positive points. Negative / reversal events should use a
  -- separate path (wallet_ledger debits) to keep accounting clean.
  IF NEW.points_awarded IS NULL OR NEW.points_awarded <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO swyp_wallets (user_id, balance_points, lifetime_earned)
  VALUES (NEW.user_id, NEW.points_awarded, NEW.points_awarded)
  ON CONFLICT (user_id) DO UPDATE
    SET balance_points  = swyp_wallets.balance_points  + EXCLUDED.balance_points,
        lifetime_earned = swyp_wallets.lifetime_earned + EXCLUDED.lifetime_earned,
        updated_at      = now();

  RETURN NEW;
END;
$$;


--
-- Name: fn_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: get_or_create_dm(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_or_create_dm(uuid_a uuid, uuid_b uuid) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  IF uuid_a IS NULL OR uuid_b IS NULL OR uuid_a = uuid_b THEN
    RAISE EXCEPTION 'get_or_create_dm: invalid participants';
  END IF;

  SELECT c.id
    INTO v_conv_id
    FROM conversations c
    JOIN conversation_participants pa ON pa.conversation_id = c.id AND pa.user_id = uuid_a
    JOIN conversation_participants pb ON pb.conversation_id = c.id AND pb.user_id = uuid_b
   WHERE c.kind = 'dm'
     AND (SELECT COUNT(*) FROM conversation_participants p WHERE p.conversation_id = c.id) = 2
   LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  INSERT INTO conversations (kind, created_by)
    VALUES ('dm', uuid_a)
    RETURNING id INTO v_conv_id;

  INSERT INTO conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, uuid_a), (v_conv_id, uuid_b)
    ON CONFLICT DO NOTHING;

  RETURN v_conv_id;
END;
$$;


--
-- Name: social_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.social_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: tg_ae_import_jobs_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_ae_import_jobs_touch() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: tg_taxonomy_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_taxonomy_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: trg_creator_missions_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_creator_missions_touch() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: trg_product_safety_labels_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_product_safety_labels_touch() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: video_safety_labels_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.video_safety_labels_touch() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: wallet_apply(uuid, text, numeric, text, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wallet_apply(p_user_id uuid, p_kind text, p_delta numeric, p_reason text, p_ref_type text DEFAULT NULL::text, p_ref_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_balance numeric;
BEGIN
  IF p_delta = 0 THEN RAISE EXCEPTION 'wallet_apply: delta=0 not allowed'; END IF;
  IF p_kind NOT IN ('xp','coins','reputation') THEN
    RAISE EXCEPTION 'wallet_apply: invalid kind %', p_kind;
  END IF;

  -- Ensure row exists.
  INSERT INTO user_wallets(user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  IF p_kind = 'xp' THEN
    UPDATE user_wallets
       SET xp = xp + p_delta::bigint,
           total_xp_earned = CASE WHEN p_delta > 0 THEN total_xp_earned + p_delta::bigint ELSE total_xp_earned END,
           level = GREATEST(1, FLOOR(SQRT((xp + p_delta::bigint)::numeric / 100))::int),
           updated_at = now()
     WHERE user_id = p_user_id
     RETURNING xp INTO v_balance;
  ELSIF p_kind = 'coins' THEN
    UPDATE user_wallets
       SET coins = coins + p_delta::int,
           total_coins_earned = CASE WHEN p_delta > 0 THEN total_coins_earned + p_delta::int ELSE total_coins_earned END,
           total_coins_spent  = CASE WHEN p_delta < 0 THEN total_coins_spent  + (-p_delta)::int ELSE total_coins_spent END,
           updated_at = now()
     WHERE user_id = p_user_id
     RETURNING coins INTO v_balance;
    IF v_balance < 0 THEN
      RAISE EXCEPTION 'wallet_apply: insufficient coins (balance would be %)', v_balance;
    END IF;
  ELSE  -- reputation
    UPDATE user_wallets
       SET reputation = reputation + p_delta,
           updated_at = now()
     WHERE user_id = p_user_id
     RETURNING reputation INTO v_balance;
  END IF;

  INSERT INTO wallet_ledger(user_id, kind, delta, balance_after, reason, ref_type, ref_id, metadata)
       VALUES (p_user_id, p_kind, p_delta, v_balance, p_reason, p_ref_type, p_ref_id, p_metadata);

  RETURN v_balance;
END $$;


--
-- Name: wallet_bump_streak(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wallet_bump_streak(p_user_id uuid) RETURNS TABLE(streak integer, xp_awarded integer, coins_awarded integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Bucharest')::date;
  v_last  date;
  v_new_streak integer;
  v_xp integer := 10;
  v_coins integer := 5;
BEGIN
  INSERT INTO user_wallets(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;

  SELECT last_active_day INTO v_last FROM user_wallets WHERE user_id = p_user_id;

  IF v_last = v_today THEN
    -- Already counted today, no-op.
    SELECT streak_current INTO v_new_streak FROM user_wallets WHERE user_id = p_user_id;
    RETURN QUERY SELECT v_new_streak, 0, 0;
    RETURN;
  ELSIF v_last = v_today - 1 THEN
    UPDATE user_wallets SET streak_current = streak_current + 1,
                            streak_best    = GREATEST(streak_best, streak_current + 1),
                            last_active_day = v_today,
                            updated_at = now()
     WHERE user_id = p_user_id RETURNING streak_current INTO v_new_streak;
  ELSE
    UPDATE user_wallets SET streak_current = 1,
                            streak_best    = GREATEST(streak_best, 1),
                            last_active_day = v_today,
                            updated_at = now()
     WHERE user_id = p_user_id RETURNING streak_current INTO v_new_streak;
  END IF;

  -- Scale bonus with streak (cap at 30 days).
  v_xp    := LEAST(v_new_streak, 30) * 10;
  v_coins := LEAST(v_new_streak, 30) * 5;
  PERFORM wallet_apply(p_user_id, 'xp',    v_xp,    'streak_day', NULL, NULL, jsonb_build_object('streak', v_new_streak));
  PERFORM wallet_apply(p_user_id, 'coins', v_coins, 'streak_day', NULL, NULL, jsonb_build_object('streak', v_new_streak));

  RETURN QUERY SELECT v_new_streak, v_xp, v_coins;
END $$;




--
-- Name: admin_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_sessions (
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: ae_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ae_categories (
    id integer NOT NULL,
    ae_category_id integer NOT NULL,
    parent_id integer,
    name character varying(200) NOT NULL,
    name_ro character varying(200),
    level integer NOT NULL,
    product_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    is_adult boolean DEFAULT false NOT NULL
);


--
-- Name: ae_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ae_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ae_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ae_categories_id_seq OWNED BY public.ae_categories.id;


--
-- Name: ae_category_full_chain; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ae_category_full_chain (
    leaf_id bigint NOT NULL,
    chain_ids bigint[] NOT NULL,
    chain_names_en text[] DEFAULT '{}'::text[] NOT NULL,
    chain_names_ro text[] DEFAULT '{}'::text[] NOT NULL,
    depth smallint NOT NULL,
    root_id bigint NOT NULL,
    source text DEFAULT 'text.search'::text NOT NULL,
    discovered_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ae_import_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ae_import_jobs (
    product_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    category_hint text,
    source_files text[] DEFAULT '{}'::text[] NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    imported_db_id uuid,
    fetched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ae_import_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: ae_oauth_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ae_oauth_tokens (
    id bigint NOT NULL,
    app_key text NOT NULL,
    access_token text NOT NULL,
    refresh_token text,
    expires_at timestamp with time zone,
    obtained_at timestamp with time zone DEFAULT now() NOT NULL,
    raw jsonb
);


--
-- Name: ae_oauth_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ae_oauth_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ae_oauth_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ae_oauth_tokens_id_seq OWNED BY public.ae_oauth_tokens.id;


--
-- Name: ae_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ae_products (
    id integer NOT NULL,
    ae_product_id bigint NOT NULL,
    category_id integer NOT NULL,
    title text NOT NULL,
    title_ro text,
    description text,
    mobile_detail jsonb,
    min_price_usd numeric(10,2) NOT NULL,
    max_price_usd numeric(10,2),
    original_price_usd numeric(10,2),
    price_ron integer,
    old_price_ron integer,
    markup numeric(3,1),
    main_image text,
    images text[],
    video_url text,
    video_poster text,
    has_video boolean DEFAULT false,
    rating numeric(2,1),
    rating_count integer DEFAULT 0,
    orders_count integer DEFAULT 0,
    product_status character varying(20),
    brand character varying(100),
    properties jsonb,
    ship_method character varying(100),
    ship_cost_usd numeric(10,2) DEFAULT 0,
    ship_free boolean DEFAULT false,
    ship_days_min integer,
    ship_days_max integer,
    ship_tracking boolean DEFAULT false,
    ship_from character varying(50),
    store_id bigint,
    store_name character varying(200),
    store_rating numeric(2,1),
    variants_count integer DEFAULT 1,
    source_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    delivery_date_desc character varying(200),
    neckline character varying(100),
    style character varying(100),
    fabric_type character varying(100),
    color character varying(100),
    colors text[],
    sizes text[],
    material character varying(200),
    pattern_type character varying(100),
    sleeve_style character varying(100),
    waistline character varying(100),
    season character varying(100),
    silhouette character varying(100),
    decoration text[],
    gender character varying(50),
    free_shipping_threshold character varying(100),
    available_stock integer,
    has_audio boolean DEFAULT false,
    title_translations jsonb,
    ai_attributes jsonb,
    product_type text,
    product_type_ro text,
    is_adult boolean DEFAULT false NOT NULL,
    adult_reason text
);


--
-- Name: ae_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ae_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ae_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ae_products_id_seq OWNED BY public.ae_products.id;


--
-- Name: ae_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ae_variants (
    id integer NOT NULL,
    product_id bigint NOT NULL,
    sku_id character varying(30) NOT NULL,
    price_usd numeric(10,2) NOT NULL,
    original_price_usd numeric(10,2),
    price_ron integer,
    variant_name character varying(200),
    variant_image text,
    stock integer DEFAULT 0,
    properties jsonb,
    color character varying(100),
    size character varying(100)
);


--
-- Name: ae_variants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ae_variants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ae_variants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ae_variants_id_seq OWNED BY public.ae_variants.id;


--
-- Name: analytics_delivery_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_delivery_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    destination text DEFAULT 'clickhouse'::text NOT NULL,
    stream_name text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    event_count integer DEFAULT 0 NOT NULL,
    first_event_at timestamp with time zone,
    last_event_at timestamp with time zone,
    delivered_at timestamp with time zone,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT analytics_delivery_batches_destination_check CHECK ((destination = ANY (ARRAY['clickhouse'::text, 'warehouse'::text, 'other'::text]))),
    CONSTRAINT analytics_delivery_batches_event_count_check CHECK ((event_count >= 0)),
    CONSTRAINT analytics_delivery_batches_status_check CHECK ((status = ANY (ARRAY['open'::text, 'sealed'::text, 'delivered'::text, 'failed'::text])))
);


--
-- Name: anon_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anon_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    anon_id uuid NOT NULL,
    kind text NOT NULL,
    target_kind text NOT NULL,
    target_id uuid NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attributed_user_id uuid,
    attributed_at timestamp with time zone
);


--
-- Name: anon_post_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anon_post_votes (
    post_id uuid NOT NULL,
    anon_id uuid NOT NULL,
    option_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    attributed_user_id uuid,
    attributed_at timestamp with time zone
);


--
-- Name: anon_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anon_sessions (
    anon_id uuid NOT NULL,
    ip_hash text,
    ua_hash text,
    fp_hash text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    became_user_id uuid,
    attributed_at timestamp with time zone
)
WITH (autovacuum_vacuum_scale_factor='0.05', autovacuum_vacuum_threshold='100', autovacuum_analyze_scale_factor='0.05', autovacuum_analyze_threshold='100');


--
-- Name: audio_tracks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audio_tracks (
    id bigint NOT NULL,
    source text DEFAULT 'jamendo'::text NOT NULL,
    source_id text NOT NULL,
    title text NOT NULL,
    artist text NOT NULL,
    duration_s integer NOT NULL,
    audio_url text NOT NULL,
    preview_url text,
    image_url text,
    waveform_url text,
    tags text[] DEFAULT '{}'::text[],
    genre text,
    license text,
    attribution_url text,
    popularity integer DEFAULT 0 NOT NULL,
    plays_count integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audio_tracks_duration_s_check CHECK ((duration_s > 0))
);


--
-- Name: audio_tracks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audio_tracks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audio_tracks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audio_tracks_id_seq OWNED BY public.audio_tracks.id;


--
-- Name: auth_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    provider_subject text NOT NULL,
    email text,
    email_verified boolean DEFAULT false NOT NULL,
    access_token_ref text,
    refresh_token_ref text,
    linked_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_accounts_provider_check CHECK ((provider = ANY (ARRAY['email'::text, 'google'::text, 'apple'::text, 'facebook'::text, 'tiktok'::text, 'github'::text, 'stripe'::text, 'shopify'::text, 'other'::text])))
);


--
-- Name: cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cart_id uuid NOT NULL,
    external_product_id text NOT NULL,
    external_variant_id text,
    marketplace_product_id uuid,
    marketplace_variant_id uuid,
    title text NOT NULL,
    quantity integer NOT NULL,
    currency character(3) DEFAULT 'RON'::bpchar NOT NULL,
    unit_amount_cents integer NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cart_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT cart_items_unit_amount_cents_check CHECK ((unit_amount_cents >= 0))
);


--
-- Name: carts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.carts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_cart_id text,
    user_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    currency character(3) DEFAULT 'RON'::bpchar NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT carts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'checkout_started'::text, 'ordered'::text, 'abandoned'::text, 'expired'::text])))
);


--
-- Name: challenge_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.challenge_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    challenge_id uuid NOT NULL,
    user_id uuid NOT NULL,
    video_id uuid,
    status text DEFAULT 'submitted'::text NOT NULL,
    score numeric(10,4) DEFAULT 0 NOT NULL,
    rank integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT challenge_entries_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'winner'::text, 'disqualified'::text])))
);


--
-- Name: checkout_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkout_audit_log (
    id bigint NOT NULL,
    event text NOT NULL,
    pg_id bigint,
    sku_id text,
    price_ron numeric(12,2),
    client_ip text,
    user_agent text,
    payload jsonb,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: checkout_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.checkout_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: checkout_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.checkout_audit_log_id_seq OWNED BY public.checkout_audit_log.id;


--
-- Name: checkout_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkout_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    order_id uuid,
    provider text DEFAULT 'stripe'::text NOT NULL,
    provider_session_id text NOT NULL,
    status text DEFAULT 'created'::text NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    amount_total_cents integer DEFAULT 0 NOT NULL,
    success_url text,
    cancel_url text,
    expires_at timestamp with time zone,
    completed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT checkout_sessions_amount_total_cents_check CHECK ((amount_total_cents >= 0)),
    CONSTRAINT checkout_sessions_provider_check CHECK ((provider = ANY (ARRAY['stripe'::text, 'shopify'::text, 'paypal'::text, 'manual'::text]))),
    CONSTRAINT checkout_sessions_status_check CHECK ((status = ANY (ARRAY['created'::text, 'open'::text, 'completed'::text, 'expired'::text, 'cancelled'::text, 'failed'::text])))
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_id uuid NOT NULL,
    user_id uuid,
    parent_comment_id uuid,
    body text NOT NULL,
    status text DEFAULT 'visible'::text NOT NULL,
    like_count bigint DEFAULT 0 NOT NULL,
    reply_count bigint DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comments_like_count_check CHECK ((like_count >= 0)),
    CONSTRAINT comments_reply_count_check CHECK ((reply_count >= 0)),
    CONSTRAINT comments_status_check CHECK ((status = ANY (ARRAY['visible'::text, 'hidden'::text, 'deleted'::text, 'flagged'::text])))
);


--
-- Name: commerce_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commerce_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    variant_id uuid,
    creator_id uuid,
    video_id uuid,
    creator_product_link_id uuid,
    external_line_item_id text,
    title text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    unit_amount_cents integer DEFAULT 0 NOT NULL,
    gross_amount_cents integer DEFAULT 0 NOT NULL,
    commissionable_amount_cents integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_status text DEFAULT 'pending'::text NOT NULL,
    payout_status text,
    CONSTRAINT commerce_order_items_commissionable_amount_cents_check CHECK ((commissionable_amount_cents >= 0)),
    CONSTRAINT commerce_order_items_gross_amount_cents_check CHECK ((gross_amount_cents >= 0)),
    CONSTRAINT commerce_order_items_payout_status_check CHECK (((payout_status IS NULL) OR (payout_status = ANY (ARRAY['not_connected'::text, 'pending'::text, 'paid'::text, 'failed'::text, 'no_account'::text, 'restricted'::text, 'refunded'::text])))),
    CONSTRAINT commerce_order_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT commerce_order_items_source_status_check CHECK ((source_status = ANY (ARRAY['pending'::text, 'pending_seller_action'::text, 'pending_dropship'::text, 'processing_dropship'::text, 'fulfilled'::text, 'cancelled'::text, 'failed'::text]))),
    CONSTRAINT commerce_order_items_unit_amount_cents_check CHECK ((unit_amount_cents >= 0))
);


--
-- Name: commerce_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commerce_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buyer_user_id uuid,
    merchant_id uuid,
    source_share_id uuid,
    external_order_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    subtotal_cents integer DEFAULT 0 NOT NULL,
    discount_cents integer DEFAULT 0 NOT NULL,
    shipping_cents integer DEFAULT 0 NOT NULL,
    tax_cents integer DEFAULT 0 NOT NULL,
    total_cents integer DEFAULT 0 NOT NULL,
    placed_at timestamp with time zone,
    fulfilled_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tax_country text,
    tax_id_collected text,
    CONSTRAINT commerce_orders_discount_cents_check CHECK ((discount_cents >= 0)),
    CONSTRAINT commerce_orders_shipping_cents_check CHECK ((shipping_cents >= 0)),
    CONSTRAINT commerce_orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'authorized'::text, 'paid'::text, 'fulfilled'::text, 'delivered'::text, 'return_requested'::text, 'cancelled'::text, 'refunded'::text, 'failed'::text, 'disputed'::text]))),
    CONSTRAINT commerce_orders_subtotal_cents_check CHECK ((subtotal_cents >= 0)),
    CONSTRAINT commerce_orders_tax_cents_check CHECK ((tax_cents >= 0)),
    CONSTRAINT commerce_orders_total_cents_check CHECK ((total_cents >= 0))
);


--
-- Name: commission_payout_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commission_payout_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payout_id uuid NOT NULL,
    commission_id uuid NOT NULL,
    amount_cents integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT commission_payout_items_amount_cents_check CHECK ((amount_cents >= 0))
);


--
-- Name: commission_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commission_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    connect_account_id uuid,
    provider text DEFAULT 'stripe'::text NOT NULL,
    provider_payout_id text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    gross_amount_cents integer DEFAULT 0 NOT NULL,
    platform_fee_cents integer DEFAULT 0 NOT NULL,
    net_amount_cents integer DEFAULT 0 NOT NULL,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    scheduled_at timestamp with time zone,
    submitted_at timestamp with time zone,
    paid_at timestamp with time zone,
    failed_at timestamp with time zone,
    failure_code text,
    failure_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT commission_payouts_check CHECK (((period_end IS NULL) OR (period_start IS NULL) OR (period_end >= period_start))),
    CONSTRAINT commission_payouts_gross_amount_cents_check CHECK ((gross_amount_cents >= 0)),
    CONSTRAINT commission_payouts_net_amount_cents_check CHECK ((net_amount_cents >= 0)),
    CONSTRAINT commission_payouts_platform_fee_cents_check CHECK ((platform_fee_cents >= 0)),
    CONSTRAINT commission_payouts_provider_check CHECK ((provider = ANY (ARRAY['stripe'::text, 'manual'::text]))),
    CONSTRAINT commission_payouts_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'processing'::text, 'paid'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    buyer_user_id uuid,
    video_id uuid,
    source_share_id uuid,
    external_order_id text,
    external_line_item_id text,
    commission_type text DEFAULT 'affiliate'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    gross_amount_cents integer DEFAULT 0 NOT NULL,
    creator_amount_cents integer DEFAULT 0 NOT NULL,
    platform_fee_cents integer DEFAULT 0 NOT NULL,
    approved_at timestamp with time zone,
    payable_at timestamp with time zone,
    paid_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    commerce_order_id uuid,
    commerce_order_item_id uuid,
    product_id uuid,
    connect_account_id uuid,
    payment_transaction_id uuid,
    commission_rate_bps integer,
    CONSTRAINT commissions_commission_rate_bps_check CHECK (((commission_rate_bps IS NULL) OR ((commission_rate_bps >= 0) AND (commission_rate_bps <= 10000)))),
    CONSTRAINT commissions_commission_type_check CHECK ((commission_type = ANY (ARRAY['affiliate'::text, 'sponsored'::text, 'manual_adjustment'::text]))),
    CONSTRAINT commissions_creator_amount_cents_check CHECK ((creator_amount_cents >= 0)),
    CONSTRAINT commissions_gross_amount_cents_check CHECK ((gross_amount_cents >= 0)),
    CONSTRAINT commissions_platform_fee_cents_check CHECK ((platform_fee_cents >= 0)),
    CONSTRAINT commissions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'payable'::text, 'paid'::text, 'void'::text, 'refunded'::text])))
);


--
-- Name: community_post_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_post_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    product_id uuid,
    external_url text,
    external_image text,
    external_title text,
    external_price_minor integer,
    external_currency text,
    option_key text DEFAULT 'main'::text NOT NULL,
    label text,
    vote_count integer DEFAULT 0 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_post_items_check CHECK (((product_id IS NOT NULL) OR (external_url IS NOT NULL)))
)
WITH (autovacuum_vacuum_scale_factor='0.05', autovacuum_vacuum_threshold='50', autovacuum_analyze_scale_factor='0.05', autovacuum_analyze_threshold='50');


--
-- Name: community_post_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_post_replies (
    parent_post_id uuid NOT NULL,
    reply_post_id uuid NOT NULL,
    upvotes integer DEFAULT 0 NOT NULL,
    is_accepted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: community_post_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_post_votes (
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    option_key text NOT NULL,
    weight smallint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_post_votes_weight_check CHECK (((weight >= '-1'::integer) AND (weight <= 5)))
)
WITH (autovacuum_vacuum_scale_factor='0.05', autovacuum_vacuum_threshold='50', autovacuum_analyze_scale_factor='0.05', autovacuum_analyze_threshold='50');


--
-- Name: community_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text,
    author_user_id uuid NOT NULL,
    format text NOT NULL,
    title text NOT NULL,
    body text,
    budget_minor integer,
    budget_currency text DEFAULT 'RON'::text,
    video_id uuid,
    mission_id uuid,
    vote_count integer DEFAULT 0 NOT NULL,
    comment_count integer DEFAULT 0 NOT NULL,
    save_count integer DEFAULT 0 NOT NULL,
    share_count integer DEFAULT 0 NOT NULL,
    view_count integer DEFAULT 0 NOT NULL,
    hot_score numeric(6,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    is_adult boolean DEFAULT false NOT NULL,
    ends_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_posts_format_check CHECK ((format = ANY (ARRAY['merita'::text, 'battle'::text, 'find_me'::text, 'setup'::text, 'drop'::text, 'review_real'::text, 'dupe_hunt'::text, 'roast_cart'::text]))),
    CONSTRAINT community_posts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text, 'removed'::text, 'flagged'::text])))
);


--
-- Name: connect_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connect_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    commission_id uuid,
    payout_id uuid,
    connect_account_id uuid NOT NULL,
    provider text DEFAULT 'stripe'::text NOT NULL,
    provider_transfer_id text,
    destination_account_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    amount_cents integer NOT NULL,
    reversed_amount_cents integer DEFAULT 0 NOT NULL,
    submitted_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    failure_code text,
    failure_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT connect_transfers_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT connect_transfers_provider_check CHECK ((provider = ANY (ARRAY['stripe'::text, 'manual'::text]))),
    CONSTRAINT connect_transfers_reversed_amount_cents_check CHECK ((reversed_amount_cents >= 0)),
    CONSTRAINT connect_transfers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'submitted'::text, 'succeeded'::text, 'failed'::text, 'reversed'::text, 'cancelled'::text])))
);


--
-- Name: conversation_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_participants (
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    last_read_at timestamp with time zone,
    muted_until timestamp with time zone
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text DEFAULT 'dm'::text NOT NULL,
    created_by uuid,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conversations_kind_check CHECK ((kind = ANY (ARRAY['dm'::text, 'group'::text])))
);


--
-- Name: creator_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    requested_handle text NOT NULL,
    category text,
    website_url text,
    social_links jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    reviewer_user_id uuid,
    review_note text,
    reviewed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_applications_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'in_review'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text])))
);


--
-- Name: creator_collection_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_collection_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collection_id uuid NOT NULL,
    video_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    note text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: creator_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    slug text,
    visibility text DEFAULT 'public'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_collections_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'unlisted'::text, 'private'::text])))
);


--
-- Name: creator_connect_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_connect_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    creator_profile_id uuid,
    provider text DEFAULT 'stripe'::text NOT NULL,
    provider_account_id text NOT NULL,
    account_status text DEFAULT 'created'::text NOT NULL,
    charges_enabled boolean DEFAULT false NOT NULL,
    payouts_enabled boolean DEFAULT false NOT NULL,
    details_submitted boolean DEFAULT false NOT NULL,
    country character(2),
    default_currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    requirements_currently_due text[] DEFAULT ARRAY[]::text[] NOT NULL,
    requirements_eventually_due text[] DEFAULT ARRAY[]::text[] NOT NULL,
    disabled_reason text,
    onboarding_url text,
    onboarding_expires_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_connect_accounts_account_status_check CHECK ((account_status = ANY (ARRAY['created'::text, 'onboarding'::text, 'active'::text, 'restricted'::text, 'disabled'::text, 'rejected'::text]))),
    CONSTRAINT creator_connect_accounts_provider_check CHECK ((provider = ANY (ARRAY['stripe'::text, 'manual'::text])))
);


--
-- Name: creator_mission_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_mission_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mission_id uuid NOT NULL,
    user_id uuid NOT NULL,
    video_id uuid,
    status text DEFAULT 'submitted'::text NOT NULL,
    ai_score numeric(5,2),
    views integer DEFAULT 0 NOT NULL,
    likes integer DEFAULT 0 NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    add_to_carts integer DEFAULT 0 NOT NULL,
    sales integer DEFAULT 0 NOT NULL,
    payout_minor integer DEFAULT 0 NOT NULL,
    payout_currency text DEFAULT 'SWYP'::text NOT NULL,
    paid_at timestamp with time zone,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_mission_submissions_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text, 'winner'::text, 'paid'::text])))
);


--
-- Name: creator_missions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_missions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    seller_id uuid,
    product_id uuid,
    title text NOT NULL,
    brief text,
    format_hint text,
    prize_amount_minor integer DEFAULT 0 NOT NULL,
    prize_currency text DEFAULT 'SWYP'::text NOT NULL,
    max_winners integer,
    bounty_per_sale_minor integer DEFAULT 0 NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_missions_prize_currency_check CHECK ((prize_currency = ANY (ARRAY['SWYP'::text, 'RON'::text, 'EUR'::text]))),
    CONSTRAINT creator_missions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text, 'archived'::text])))
);


--
-- Name: creator_product_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_product_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    product_id uuid NOT NULL,
    offer_id uuid,
    tracking_code text,
    affiliate_url text,
    utm_source text,
    commission_rate_bps integer,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_product_links_commission_rate_bps_check CHECK (((commission_rate_bps IS NULL) OR ((commission_rate_bps >= 0) AND (commission_rate_bps <= 10000)))),
    CONSTRAINT creator_product_links_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'disabled'::text])))
);


--
-- Name: creator_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    handle text NOT NULL,
    display_name text,
    bio text,
    avatar_url text,
    banner_url text,
    category text,
    website_url text,
    social_links jsonb DEFAULT '{}'::jsonb NOT NULL,
    verification_status text DEFAULT 'unverified'::text NOT NULL,
    payout_status text DEFAULT 'not_connected'::text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verified_at timestamp with time zone,
    CONSTRAINT creator_profiles_payout_status_check CHECK ((payout_status = ANY (ARRAY['not_connected'::text, 'pending'::text, 'connected'::text, 'restricted'::text]))),
    CONSTRAINT creator_profiles_verification_status_check CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'rejected'::text])))
);


--
-- Name: creators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    social_link text NOT NULL,
    followers text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creators_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'active'::text, 'suspended'::text, 'rejected'::text])))
);


--
-- Name: cron_job_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cron_job_runs (
    id bigint NOT NULL,
    job_name text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text NOT NULL,
    duration_ms integer,
    error text,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT cron_job_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text])))
);


--
-- Name: cron_job_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cron_job_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cron_job_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cron_job_runs_id_seq OWNED BY public.cron_job_runs.id;


--
-- Name: cron_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cron_runs (
    id bigint NOT NULL,
    job_name text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text,
    duration_ms integer,
    result jsonb,
    error text,
    CONSTRAINT cron_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'failed'::text])))
);


--
-- Name: cron_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cron_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cron_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cron_runs_id_seq OWNED BY public.cron_runs.id;


--
-- Name: customer_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text,
    phone text,
    default_address jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: daily_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    challenge_type text DEFAULT 'video'::text NOT NULL,
    topic text,
    reward_points integer DEFAULT 50 NOT NULL,
    max_entries integer,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    banner_url text,
    rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT daily_challenges_challenge_type_check CHECK ((challenge_type = ANY (ARRAY['video'::text, 'review'::text, 'engagement'::text, 'commerce'::text, 'community'::text]))),
    CONSTRAINT daily_challenges_check CHECK ((ends_at > starts_at)),
    CONSTRAINT daily_challenges_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: daily_mission_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_mission_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    description text,
    kind text NOT NULL,
    target integer DEFAULT 1 NOT NULL,
    reward_xp integer DEFAULT 0 NOT NULL,
    reward_coins integer DEFAULT 0 NOT NULL,
    reward_reputation numeric(6,2) DEFAULT 0 NOT NULL,
    weekday_mask integer DEFAULT 127 NOT NULL,
    weight integer DEFAULT 100 NOT NULL,
    min_level integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT daily_mission_templates_target_check CHECK ((target > 0))
);


--
-- Name: email_unsubscribes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_unsubscribes (
    email_lower text NOT NULL,
    unsubscribed_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text,
    user_id uuid
);


--
-- Name: event_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stream_name text NOT NULL,
    event_type text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid,
    actor_user_id uuid,
    idempotency_key text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    headers jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_outbox_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT event_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'publishing'::text, 'published'::text, 'failed'::text, 'dead'::text])))
);


--
-- Name: feed_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid,
    video_id uuid,
    comment_id uuid,
    event_type text NOT NULL,
    audience text DEFAULT 'global'::text NOT NULL,
    score numeric(10,4) DEFAULT 0 NOT NULL,
    source text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    session_id text,
    watch_ms integer,
    position_ms integer,
    ip_hash text,
    country text,
    CONSTRAINT feed_events_audience_check CHECK ((audience = ANY (ARRAY['global'::text, 'followers'::text, 'personalized'::text]))),
    CONSTRAINT feed_events_check CHECK (((expires_at IS NULL) OR (expires_at > occurred_at))),
    CONSTRAINT feed_events_event_type_check CHECK ((event_type = ANY (ARRAY['video_view'::text, 'watch_time'::text, 'completion'::text, 'rewatch'::text, 'skip_fast'::text, 'pause'::text, 'resume'::text, 'seek'::text, 'like'::text, 'unlike'::text, 'save'::text, 'unsave'::text, 'share'::text, 'comment'::text, 'follow'::text, 'unfollow'::text, 'product_click'::text, 'add_to_cart'::text, 'purchase'::text, 'not_interested'::text, 'more_like_this'::text, 'report'::text, 'impression'::text, 'video_published'::text, 'video_viewed'::text, 'video_liked'::text, 'video_saved'::text, 'video_shared'::text, 'comment_created'::text, 'creator_followed'::text, 'video_hidden'::text, 'creator_unfollowed'::text])))
);


--
-- Name: feed_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    video_id uuid NOT NULL,
    creator_id uuid,
    source_event_id uuid,
    feed_type text DEFAULT 'for_you'::text NOT NULL,
    reason text,
    score numeric(12,6) DEFAULT 0 NOT NULL,
    rank_bucket text,
    status text DEFAULT 'active'::text NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feed_items_check CHECK (((expires_at IS NULL) OR (expires_at > available_at))),
    CONSTRAINT feed_items_feed_type_check CHECK ((feed_type = ANY (ARRAY['for_you'::text, 'following'::text, 'creator'::text, 'product'::text, 'search'::text, 'global'::text]))),
    CONSTRAINT feed_items_status_check CHECK ((status = ANY (ARRAY['active'::text, 'hidden'::text, 'expired'::text])))
);


--
-- Name: follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    follower_user_id uuid NOT NULL,
    following_user_id uuid NOT NULL,
    notification_level text DEFAULT 'highlights'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT follows_check CHECK ((follower_user_id <> following_user_id)),
    CONSTRAINT follows_notification_level_check CHECK ((notification_level = ANY (ARRAY['none'::text, 'highlights'::text, 'all'::text])))
);


--
-- Name: fulfillment_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fulfillment_shipments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    commerce_order_id uuid NOT NULL,
    supplier_order_id uuid,
    carrier text,
    tracking_number text,
    tracking_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    shipped_at timestamp with time zone,
    delivered_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fulfillment_shipments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'label_created'::text, 'in_transit'::text, 'delivered'::text, 'exception'::text, 'returned'::text, 'cancelled'::text])))
);


--
-- Name: fx_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fx_rates (
    base text DEFAULT 'EUR'::text NOT NULL,
    quote text NOT NULL,
    rate numeric(18,8) NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
)
WITH (autovacuum_vacuum_scale_factor='0.05', autovacuum_vacuum_threshold='50', autovacuum_analyze_scale_factor='0.05', autovacuum_analyze_threshold='50');


--
-- Name: likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    video_id uuid,
    comment_id uuid,
    reaction text DEFAULT 'like'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT likes_check CHECK ((((video_id IS NOT NULL) AND (comment_id IS NULL)) OR ((video_id IS NULL) AND (comment_id IS NOT NULL))))
);


--
-- Name: live_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_chat_messages (
    id bigint NOT NULL,
    stream_id uuid NOT NULL,
    user_id text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: live_chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.live_chat_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: live_chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.live_chat_messages_id_seq OWNED BY public.live_chat_messages.id;


--
-- Name: live_polls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_polls (
    id bigint NOT NULL,
    stream_id uuid NOT NULL,
    question text NOT NULL,
    options jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone
);


--
-- Name: live_polls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.live_polls_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: live_polls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.live_polls_id_seq OWNED BY public.live_polls.id;


--
-- Name: live_shop_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_shop_items (
    id bigint NOT NULL,
    stream_id uuid NOT NULL,
    product_id text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    flash_price_cents bigint,
    flash_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: live_shop_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.live_shop_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: live_shop_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.live_shop_items_id_seq OWNED BY public.live_shop_items.id;


--
-- Name: live_streams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_streams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id text NOT NULL,
    title text NOT NULL,
    description text,
    stream_key text NOT NULL,
    rtmp_url text,
    hls_url text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    viewer_count integer DEFAULT 0 NOT NULL,
    peak_viewers integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT live_streams_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'live'::text, 'ended'::text, 'failed'::text])))
);


--
-- Name: marketplace_merchants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_merchants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid,
    name text NOT NULL,
    external_ref text,
    website_url text,
    support_email text,
    default_currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    onboarding_status text DEFAULT 'not_started'::text NOT NULL,
    commission_rate_bps integer,
    payout_provider text,
    payout_account_ref text,
    shipping_policy jsonb DEFAULT '{}'::jsonb NOT NULL,
    return_policy jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT marketplace_merchants_commission_rate_bps_check CHECK (((commission_rate_bps IS NULL) OR ((commission_rate_bps >= 0) AND (commission_rate_bps <= 10000)))),
    CONSTRAINT marketplace_merchants_onboarding_status_check CHECK ((onboarding_status = ANY (ARRAY['not_started'::text, 'pending'::text, 'verified'::text, 'rejected'::text, 'disabled'::text]))),
    CONSTRAINT marketplace_merchants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'disabled'::text])))
);


--
-- Name: marketplace_product_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_product_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    merchant_id uuid,
    offer_url text NOT NULL,
    source text DEFAULT 'direct'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    price_cents integer,
    commission_rate_bps integer,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketplace_product_offers_check CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at > starts_at))),
    CONSTRAINT marketplace_product_offers_commission_rate_bps_check CHECK (((commission_rate_bps IS NULL) OR ((commission_rate_bps >= 0) AND (commission_rate_bps <= 10000)))),
    CONSTRAINT marketplace_product_offers_price_cents_check CHECK (((price_cents IS NULL) OR (price_cents >= 0))),
    CONSTRAINT marketplace_product_offers_source_check CHECK ((source = ANY (ARRAY['direct'::text, 'affiliate'::text, 'shopify'::text, 'manual'::text, 'other'::text]))),
    CONSTRAINT marketplace_product_offers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'expired'::text, 'disabled'::text])))
);


--
-- Name: marketplace_product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    external_variant_id text,
    sku text,
    title text,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    price_cents integer,
    inventory_quantity integer,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    supplier_cost_cents integer,
    shipping_cost_cents integer,
    CONSTRAINT marketplace_product_variants_ae_metadata_required CHECK ((((metadata ->> 'source'::text) IS DISTINCT FROM 'official_ae_api'::text) OR ((NULLIF((metadata ->> 'ae_product_id'::text), ''::text) IS NOT NULL) AND (NULLIF((metadata ->> 'ae_sku_id'::text), ''::text) IS NOT NULL) AND (NULLIF((metadata ->> 'ae_sku_attr'::text), ''::text) IS NOT NULL)))),
    CONSTRAINT marketplace_product_variants_inventory_quantity_check CHECK (((inventory_quantity IS NULL) OR (inventory_quantity >= 0))),
    CONSTRAINT marketplace_product_variants_price_cents_check CHECK (((price_cents IS NULL) OR (price_cents >= 0))),
    CONSTRAINT marketplace_product_variants_shipping_cost_cents_check CHECK (((shipping_cost_cents IS NULL) OR (shipping_cost_cents >= 0))),
    CONSTRAINT marketplace_product_variants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'out_of_stock'::text, 'archived'::text, 'disabled'::text]))),
    CONSTRAINT marketplace_product_variants_supplier_cost_cents_check CHECK (((supplier_cost_cents IS NULL) OR (supplier_cost_cents >= 0)))
);


--
-- Name: marketplace_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid,
    external_product_id text,
    slug text,
    title text NOT NULL,
    description text,
    brand text,
    category text,
    product_url text,
    image_url text,
    status text DEFAULT 'active'::text NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    price_cents integer,
    compare_at_price_cents integer,
    inventory_status text DEFAULT 'unknown'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_type text DEFAULT 'seller'::text NOT NULL,
    supplier text,
    supplier_product_id text,
    supplier_url text,
    supplier_cost_cents integer,
    seller_id uuid,
    is_adult boolean DEFAULT false NOT NULL,
    adult_reason text,
    canonical_category text,
    canonical_category_slug text,
    classification_confidence numeric(4,3),
    classification_reason text,
    taxonomy_department text,
    taxonomy_category text,
    taxonomy_subcategory text,
    taxonomy_leaf text,
    taxonomy_slug text,
    taxonomy_confidence numeric(4,3),
    taxonomy_reason text,
    taxonomy_unresolved boolean DEFAULT false NOT NULL,
    embedding public.vector(1536),
    embedding_updated_at timestamp with time zone,
    taxonomy_node_slug text,
    search_document tsvector GENERATED ALWAYS AS ((((setweight(to_tsvector('simple'::regconfig, public.f_unaccent(COALESCE(title, ''::text))), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, public.f_unaccent(COALESCE(brand, ''::text))), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, public.f_unaccent(COALESCE(category, ''::text))), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, public.f_unaccent(COALESCE(description, ''::text))), 'C'::"char"))) STORED,
    shipping_cost_cents integer,
    CONSTRAINT marketplace_products_compare_at_price_cents_check CHECK (((compare_at_price_cents IS NULL) OR (compare_at_price_cents >= 0))),
    CONSTRAINT marketplace_products_inventory_status_check CHECK ((inventory_status = ANY (ARRAY['unknown'::text, 'in_stock'::text, 'low_stock'::text, 'out_of_stock'::text, 'preorder'::text]))),
    CONSTRAINT marketplace_products_price_cents_check CHECK (((price_cents IS NULL) OR (price_cents >= 0))),
    CONSTRAINT marketplace_products_price_ge_cost_check CHECK (((supplier_cost_cents IS NULL) OR (price_cents IS NULL) OR (price_cents >= (COALESCE(supplier_cost_cents, 0) + COALESCE(shipping_cost_cents, 0))))),
    CONSTRAINT marketplace_products_shipping_cost_cents_check CHECK (((shipping_cost_cents IS NULL) OR (shipping_cost_cents >= 0))),
    CONSTRAINT marketplace_products_source_type_check CHECK ((source_type = ANY (ARRAY['seller'::text, 'aliexpress'::text, 'affiliate'::text, 'manual'::text, 'other'::text]))),
    CONSTRAINT marketplace_products_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'out_of_stock'::text, 'archived'::text, 'disabled'::text]))),
    CONSTRAINT marketplace_products_supplier_cost_cents_check CHECK (((supplier_cost_cents IS NULL) OR (supplier_cost_cents >= 0)))
);


--
-- Name: media_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_type text NOT NULL,
    owner_id uuid,
    type text NOT NULL,
    bucket text NOT NULL,
    object_key text NOT NULL,
    public_url text,
    mime_type text,
    size_bytes bigint,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_assets_owner_type_check CHECK ((owner_type = ANY (ARRAY['product'::text, 'seller'::text, 'creator'::text, 'order'::text, 'system'::text]))),
    CONSTRAINT media_assets_size_bytes_check CHECK (((size_bytes IS NULL) OR (size_bytes >= 0))),
    CONSTRAINT media_assets_status_check CHECK ((status = ANY (ARRAY['active'::text, 'processing'::text, 'ready'::text, 'failed'::text, 'deleted'::text]))),
    CONSTRAINT media_assets_type_check CHECK ((type = ANY (ARRAY['image'::text, 'video'::text, 'thumbnail'::text, 'document'::text, 'export'::text, 'backup'::text])))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    media_url text,
    reply_to_message_id uuid,
    status text DEFAULT 'sent'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT messages_body_check CHECK (((length(body) >= 1) AND (length(body) <= 4000))),
    CONSTRAINT messages_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'edited'::text, 'deleted'::text])))
);


--
-- Name: moderation_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderation_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    actor_user_id uuid,
    target_user_id uuid,
    target_video_id uuid,
    target_comment_id uuid,
    action_type text NOT NULL,
    reason text,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT moderation_actions_action_type_check CHECK ((action_type = ANY (ARRAY['warn'::text, 'hide'::text, 'delete'::text, 'restore'::text, 'suspend_user'::text, 'ban_user'::text, 'age_restrict'::text, 'payout_hold'::text]))),
    CONSTRAINT moderation_actions_check CHECK (((ends_at IS NULL) OR (ends_at > starts_at))),
    CONSTRAINT moderation_actions_check1 CHECK ((((((target_user_id IS NOT NULL))::integer + ((target_video_id IS NOT NULL))::integer) + ((target_comment_id IS NOT NULL))::integer) >= 1))
);


--
-- Name: moderation_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderation_cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opened_by_report_id uuid,
    assigned_user_id uuid,
    target_user_id uuid,
    target_video_id uuid,
    target_comment_id uuid,
    severity text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    decision text,
    resolution_note text,
    resolved_by_user_id uuid,
    resolved_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT moderation_cases_check CHECK ((((((target_user_id IS NOT NULL))::integer + ((target_video_id IS NOT NULL))::integer) + ((target_comment_id IS NOT NULL))::integer) = 1)),
    CONSTRAINT moderation_cases_decision_check CHECK ((decision = ANY (ARRAY['no_action'::text, 'hide'::text, 'delete'::text, 'suspend_user'::text, 'ban_user'::text, 'age_restrict'::text, 'escalate'::text]))),
    CONSTRAINT moderation_cases_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT moderation_cases_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_review'::text, 'resolved'::text, 'dismissed'::text, 'escalated'::text])))
);


--
-- Name: moderation_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderation_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reporter_user_id uuid,
    target_user_id uuid,
    target_video_id uuid,
    target_comment_id uuid,
    reason text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    note text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT moderation_reports_check CHECK ((((((target_user_id IS NOT NULL))::integer + ((target_video_id IS NOT NULL))::integer) + ((target_comment_id IS NOT NULL))::integer) = 1)),
    CONSTRAINT moderation_reports_reason_check CHECK ((reason = ANY (ARRAY['spam'::text, 'harassment'::text, 'hate'::text, 'violence'::text, 'sexual_content'::text, 'scam'::text, 'copyright'::text, 'other'::text]))),
    CONSTRAINT moderation_reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'triaged'::text, 'actioned'::text, 'dismissed'::text, 'duplicate'::text])))
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    user_id uuid NOT NULL,
    email_likes boolean DEFAULT true NOT NULL,
    email_comments boolean DEFAULT true NOT NULL,
    email_follows boolean DEFAULT true NOT NULL,
    email_messages boolean DEFAULT true NOT NULL,
    email_sales boolean DEFAULT true NOT NULL,
    email_marketing boolean DEFAULT false NOT NULL,
    push_likes boolean DEFAULT true NOT NULL,
    push_comments boolean DEFAULT true NOT NULL,
    push_follows boolean DEFAULT true NOT NULL,
    push_messages boolean DEFAULT true NOT NULL,
    push_sales boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    email_digest boolean DEFAULT true NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    actor_user_id uuid,
    video_id uuid,
    comment_id uuid,
    notification_type text NOT NULL,
    title text NOT NULL,
    body text,
    action_url text,
    delivery_status text DEFAULT 'queued'::text NOT NULL,
    read_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text, 'suppressed'::text]))),
    CONSTRAINT notifications_notification_type_check CHECK ((notification_type = ANY (ARRAY['follow'::text, 'like'::text, 'comment'::text, 'reply'::text, 'share'::text, 'commission'::text, 'system'::text, 'upload_processed'::text, 'creator_live'::text])))
)
WITH (autovacuum_vacuum_scale_factor='0.05', autovacuum_vacuum_threshold='50', autovacuum_analyze_scale_factor='0.05', autovacuum_analyze_threshold='50');


--
-- Name: oauth_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_accounts (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    provider_user_id text NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT oauth_accounts_provider_check CHECK ((provider = ANY (ARRAY['google'::text, 'apple'::text])))
);


--
-- Name: oauth_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.oauth_accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: oauth_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.oauth_accounts_id_seq OWNED BY public.oauth_accounts.id;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text DEFAULT 'stripe'::text NOT NULL,
    provider_customer_id text NOT NULL,
    default_currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_customers_provider_check CHECK ((provider = ANY (ARRAY['stripe'::text, 'shopify'::text, 'paypal'::text, 'manual'::text])))
);


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    checkout_session_id uuid,
    user_id uuid,
    provider text DEFAULT 'stripe'::text NOT NULL,
    provider_payment_id text NOT NULL,
    transaction_type text DEFAULT 'payment'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    amount_cents integer DEFAULT 0 NOT NULL,
    processed_at timestamp with time zone,
    failure_code text,
    failure_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_transactions_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT payment_transactions_provider_check CHECK ((provider = ANY (ARRAY['stripe'::text, 'shopify'::text, 'paypal'::text, 'manual'::text]))),
    CONSTRAINT payment_transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text, 'refunded'::text]))),
    CONSTRAINT payment_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['authorization'::text, 'payment'::text, 'refund'::text, 'chargeback'::text, 'adjustment'::text])))
);


--
-- Name: processed_stripe_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processed_stripe_events (
    event_id text NOT NULL,
    event_type text NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_safety_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_safety_labels (
    product_id uuid NOT NULL,
    label text NOT NULL,
    classifier_version text DEFAULT 'v2'::text NOT NULL,
    signals jsonb DEFAULT '{}'::jsonb NOT NULL,
    reasons text[] DEFAULT '{}'::text[] NOT NULL,
    reviewed_by_human boolean DEFAULT false NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by_user_id uuid,
    human_override_label text,
    classified_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_safety_labels_human_override_label_check CHECK ((human_override_label = ANY (ARRAY['safe'::text, 'sensitive'::text, 'adult'::text, 'blocked'::text]))),
    CONSTRAINT product_safety_labels_label_check CHECK ((label = ANY (ARRAY['safe'::text, 'sensitive'::text, 'adult'::text, 'blocked'::text])))
);


--
-- Name: product_effective_safety; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.product_effective_safety AS
 SELECT product_id,
    COALESCE(human_override_label, label) AS effective_label,
    reviewed_by_human,
    classified_at,
    updated_at
   FROM public.product_safety_labels;


--
-- Name: product_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    user_id uuid NOT NULL,
    order_id uuid,
    rating smallint NOT NULL,
    title text,
    body text,
    is_verified_purchase boolean DEFAULT false NOT NULL,
    helpful_count integer DEFAULT 0 NOT NULL,
    is_hidden boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: product_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_topics (
    product_id text NOT NULL,
    topic_id text NOT NULL,
    weight real DEFAULT 1.0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_topics_weight_check CHECK (((weight >= (0)::double precision) AND (weight <= (10)::double precision)))
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: redis_stream_checkpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.redis_stream_checkpoints (
    stream_name text NOT NULL,
    consumer_group text NOT NULL,
    consumer_name text NOT NULL,
    last_message_id text DEFAULT '0-0'::text NOT NULL,
    last_delivered_at timestamp with time zone,
    lag_count bigint DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT redis_stream_checkpoints_lag_count_check CHECK ((lag_count >= 0))
);


--
-- Name: referral_attributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_attributions (
    invitee_user_id uuid NOT NULL,
    referrer_user_id uuid NOT NULL,
    code text NOT NULL,
    source text NOT NULL,
    anti_fraud_score numeric(4,3) DEFAULT 1.000 NOT NULL,
    fraud_signals jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    validated_at timestamp with time zone,
    validation_action text,
    reward_event_id uuid,
    CONSTRAINT referral_attributions_not_self CHECK ((invitee_user_id <> referrer_user_id)),
    CONSTRAINT referral_attributions_source_check CHECK ((source = ANY (ARRAY['anon_cookie'::text, 'explicit_code'::text, 'share_link'::text, 'signup_form'::text])))
);


--
-- Name: referral_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_codes (
    user_id uuid NOT NULL,
    code text NOT NULL,
    total_invited integer DEFAULT 0 NOT NULL,
    total_validated integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT referral_codes_code_format CHECK ((code ~ '^[A-Z0-9]{6,12}$'::text))
);


--
-- Name: review_helpful_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_helpful_votes (
    review_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reward_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reward_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    rule_id uuid,
    action text NOT NULL,
    points_awarded integer NOT NULL,
    transaction_id uuid,
    source_type text,
    source_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
)
WITH (autovacuum_vacuum_scale_factor='0.05', autovacuum_vacuum_threshold='100', autovacuum_analyze_scale_factor='0.05', autovacuum_analyze_threshold='100');


--
-- Name: reward_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reward_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text NOT NULL,
    points integer NOT NULL,
    cooldown_minutes integer DEFAULT 0 NOT NULL,
    daily_limit integer,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    lock_days integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reward_rules_points_check CHECK ((points > 0))
);


--
-- Name: saved_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: saves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    video_id uuid NOT NULL,
    collection_name text DEFAULT 'default'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: seller_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sellers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sellers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    email text NOT NULL,
    cui text,
    phone text,
    product_type text,
    status text DEFAULT 'pending'::text NOT NULL,
    stripe_account_id text,
    business_details jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sellers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'active'::text, 'suspended'::text, 'rejected'::text])))
);


--
-- Name: service_api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid,
    name text NOT NULL,
    key_hash text NOT NULL,
    scopes text[] DEFAULT ARRAY[]::text[] NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT service_api_keys_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text])))
);


--
-- Name: shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    video_id uuid NOT NULL,
    channel text NOT NULL,
    share_token text,
    destination_url text,
    referrer_url text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shares_channel_check CHECK ((channel = ANY (ARRAY['copy_link'::text, 'native_share'::text, 'email'::text, 'sms'::text, 'whatsapp'::text, 'facebook'::text, 'instagram'::text, 'tiktok'::text, 'x'::text, 'other'::text])))
);


--
-- Name: supplier_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_order_id uuid NOT NULL,
    commerce_order_item_id uuid,
    external_product_id text,
    external_variant_id text,
    title text NOT NULL,
    quantity integer NOT NULL,
    currency character(3) DEFAULT 'RON'::bpchar NOT NULL,
    supplier_unit_cost_cents integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_order_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT supplier_order_items_supplier_unit_cost_cents_check CHECK (((supplier_unit_cost_cents IS NULL) OR (supplier_unit_cost_cents >= 0)))
);


--
-- Name: supplier_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    commerce_order_id uuid NOT NULL,
    supplier text NOT NULL,
    supplier_order_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    currency character(3) DEFAULT 'RON'::bpchar NOT NULL,
    supplier_cost_cents integer,
    shipping_cost_cents integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_orders_shipping_cost_cents_check CHECK (((shipping_cost_cents IS NULL) OR (shipping_cost_cents >= 0))),
    CONSTRAINT supplier_orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'submitted'::text, 'accepted'::text, 'processing'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text, 'failed'::text, 'refunded'::text]))),
    CONSTRAINT supplier_orders_supplier_check CHECK ((supplier = ANY (ARRAY['aliexpress'::text, 'seller'::text, 'manual'::text, 'other'::text]))),
    CONSTRAINT supplier_orders_supplier_cost_cents_check CHECK (((supplier_cost_cents IS NULL) OR (supplier_cost_cents >= 0)))
);


--
-- Name: supplier_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id text NOT NULL,
    external_order_id text NOT NULL,
    tracking_number text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: swyp_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.swyp_wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    balance_points bigint DEFAULT 0 NOT NULL,
    locked_points bigint DEFAULT 0 NOT NULL,
    lifetime_earned bigint DEFAULT 0 NOT NULL,
    lifetime_spent bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    daily_claimed_at timestamp with time zone,
    daily_streak integer DEFAULT 0 NOT NULL,
    CONSTRAINT swyp_wallets_balance_points_check CHECK ((balance_points >= 0)),
    CONSTRAINT swyp_wallets_lifetime_earned_check CHECK ((lifetime_earned >= 0)),
    CONSTRAINT swyp_wallets_lifetime_spent_check CHECK ((lifetime_spent >= 0)),
    CONSTRAINT swyp_wallets_locked_points_check CHECK ((locked_points >= 0))
)
WITH (autovacuum_vacuum_scale_factor='0.05', autovacuum_vacuum_threshold='50', autovacuum_analyze_scale_factor='0.05', autovacuum_analyze_threshold='50');


--
-- Name: taxonomy_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taxonomy_nodes (
    slug text NOT NULL,
    parent_slug text,
    kind text NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    ae_root_ids text[] DEFAULT '{}'::text[] NOT NULL,
    ae_leaf_ids text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT taxonomy_nodes_kind_check CHECK ((kind = ANY (ARRAY['department'::text, 'category'::text, 'subcategory'::text, 'leaf'::text])))
);


--
-- Name: taxonomy_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taxonomy_translations (
    node_slug text NOT NULL,
    locale text NOT NULL,
    label text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topics (
    id text NOT NULL,
    label text NOT NULL,
    parent_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tracking_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tracking_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shipment_id uuid NOT NULL,
    status text NOT NULL,
    message text,
    location text,
    occurred_at timestamp with time zone NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trending_now; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trending_now (
    id bigint NOT NULL,
    type text NOT NULL,
    name text NOT NULL,
    score numeric,
    metadata jsonb,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trending_now_type_check CHECK ((type = ANY (ARRAY['hashtag'::text, 'audio'::text, 'product'::text, 'topic'::text])))
);


--
-- Name: trending_now_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trending_now_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trending_now_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trending_now_id_seq OWNED BY public.trending_now.id;


--
-- Name: user_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    label text,
    recipient_name text NOT NULL,
    phone text,
    line1 text NOT NULL,
    line2 text,
    city text NOT NULL,
    region text,
    postal_code text NOT NULL,
    country_code character(2) DEFAULT 'RO'::bpchar NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_age_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_age_verifications (
    user_id uuid NOT NULL,
    status text NOT NULL,
    method text,
    provider_session_id text,
    document_country character(2),
    date_of_birth date,
    verified_at timestamp with time zone,
    expires_at timestamp with time zone,
    rejection_reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_age_verifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'revoked'::text])))
);


--
-- Name: user_collection_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_collection_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collection_id uuid NOT NULL,
    video_id uuid NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);


--
-- Name: user_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    slug text,
    icon text,
    color text,
    is_default boolean DEFAULT false NOT NULL,
    item_count integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_collections_item_count_check CHECK ((item_count >= 0))
);


--
-- Name: user_daily_missions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_daily_missions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    template_id uuid NOT NULL,
    day date NOT NULL,
    target integer NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    completed_at timestamp with time zone,
    claimed_at timestamp with time zone,
    reward_xp integer NOT NULL,
    reward_coins integer NOT NULL,
    reward_reputation numeric(6,2) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: user_feed_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_feed_state (
    user_id uuid NOT NULL,
    feed_type text DEFAULT 'for_you'::text NOT NULL,
    cursor_token text,
    last_refreshed_at timestamp with time zone,
    last_seen_item_id uuid,
    seen_video_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_feed_state_feed_type_check CHECK ((feed_type = ANY (ARRAY['for_you'::text, 'following'::text, 'creator'::text, 'product'::text, 'search'::text, 'global'::text])))
);


--
-- Name: user_hidden_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_hidden_videos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    video_id uuid NOT NULL,
    reason text DEFAULT 'not_interested'::text NOT NULL,
    hidden_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_hidden_videos_reason_check CHECK ((reason = ANY (ARRAY['not_interested'::text, 'reported'::text, 'already_seen'::text, 'blocked_creator'::text])))
);


--
-- Name: user_interests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_interests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    topic text NOT NULL,
    weight numeric(5,3) DEFAULT 1.000 NOT NULL,
    source text DEFAULT 'onboarding'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_interests_source_check CHECK ((source = ANY (ARRAY['onboarding'::text, 'explicit'::text, 'inferred'::text, 'more_like_this'::text, 'not_interested'::text]))),
    CONSTRAINT user_interests_weight_check CHECK (((weight >= '-5.000'::numeric) AND (weight <= 5.000)))
);


--
-- Name: user_risk_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_risk_scores (
    user_id uuid NOT NULL,
    score numeric(8,2) DEFAULT 0 NOT NULL,
    strike_count integer DEFAULT 0 NOT NULL,
    blocked_count integer DEFAULT 0 NOT NULL,
    adult_count integer DEFAULT 0 NOT NULL,
    sensitive_count integer DEFAULT 0 NOT NULL,
    last_strike_at timestamp with time zone,
    last_decay_at timestamp with time zone DEFAULT now() NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_token_hash text NOT NULL,
    device_fingerprint text,
    ip_address inet,
    user_agent text,
    last_seen_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_sessions_check CHECK ((expires_at > created_at))
);


--
-- Name: user_streaks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_streaks (
    user_id uuid NOT NULL,
    current_streak integer DEFAULT 0 NOT NULL,
    longest_streak integer DEFAULT 0 NOT NULL,
    last_active_date date DEFAULT CURRENT_DATE NOT NULL,
    total_active_days integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_streaks_current_streak_check CHECK ((current_streak >= 0)),
    CONSTRAINT user_streaks_longest_streak_check CHECK ((longest_streak >= 0)),
    CONSTRAINT user_streaks_total_active_days_check CHECK ((total_active_days >= 0))
);


--
-- Name: user_strikes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_strikes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    severity integer NOT NULL,
    label text NOT NULL,
    context text NOT NULL,
    reason text,
    ref_type text,
    ref_id text,
    signals jsonb DEFAULT '{}'::jsonb NOT NULL,
    reasons text[] DEFAULT ARRAY[]::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    status text DEFAULT 'active'::text NOT NULL,
    revoked_by uuid,
    revoked_at timestamp with time zone,
    notes text,
    CONSTRAINT user_strikes_context_check CHECK ((context = ANY (ARRAY['comment'::text, 'bio'::text, 'display_name'::text, 'post'::text, 'video'::text, 'product'::text, 'search'::text, 'report'::text, 'manual'::text]))),
    CONSTRAINT user_strikes_severity_check CHECK (((severity >= 1) AND (severity <= 10))),
    CONSTRAINT user_strikes_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text])))
);


--
-- Name: user_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_wallets (
    user_id uuid NOT NULL,
    xp bigint DEFAULT 0 NOT NULL,
    coins integer DEFAULT 0 NOT NULL,
    reputation numeric(8,2) DEFAULT 0 NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    streak_current integer DEFAULT 0 NOT NULL,
    streak_best integer DEFAULT 0 NOT NULL,
    last_active_day date,
    total_xp_earned bigint DEFAULT 0 NOT NULL,
    total_coins_earned integer DEFAULT 0 NOT NULL,
    total_coins_spent integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_wallets_coins_check CHECK ((coins >= 0)),
    CONSTRAINT user_wallets_xp_check CHECK ((xp >= 0))
);


--
-- Name: user_watch_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_watch_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    session_id text,
    video_id uuid NOT NULL,
    event_type text NOT NULL,
    watch_duration_ms integer,
    video_duration_ms integer,
    completion_pct numeric(5,2),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    client_ip inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_watch_events_completion_pct_check CHECK (((completion_pct IS NULL) OR ((completion_pct >= (0)::numeric) AND (completion_pct <= (200)::numeric)))),
    CONSTRAINT user_watch_events_event_type_check CHECK ((event_type = ANY (ARRAY['impression'::text, 'view_start'::text, 'view_end'::text, 'skip_fast'::text, 'watch_complete'::text, 'rewatch'::text, 'pause'::text, 'resume'::text, 'seek'::text, 'like'::text, 'unlike'::text, 'save'::text, 'unsave'::text, 'share'::text, 'comment'::text, 'follow'::text, 'unfollow'::text, 'product_click'::text, 'add_to_cart'::text, 'purchase'::text, 'more_like_this'::text, 'not_interested'::text, 'report'::text]))),
    CONSTRAINT user_watch_events_video_duration_ms_check CHECK (((video_duration_ms IS NULL) OR (video_duration_ms > 0))),
    CONSTRAINT user_watch_events_watch_duration_ms_check CHECK (((watch_duration_ms IS NULL) OR (watch_duration_ms >= 0)))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_auth_id text,
    username text NOT NULL,
    display_name text,
    email text,
    avatar_url text,
    bio text,
    locale text DEFAULT 'en'::text NOT NULL,
    role text DEFAULT 'shopper'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    birth_date date,
    age_verification_status text DEFAULT 'none'::text NOT NULL,
    age_verified_at timestamp with time zone,
    adult_content_opt_in boolean DEFAULT false NOT NULL,
    password_hash text,
    password_set_at timestamp with time zone,
    first_name text,
    last_name text,
    phone text,
    phone_verified_at timestamp with time zone,
    email_verified_at timestamp with time zone,
    auth_providers text[] DEFAULT ARRAY['email_otp'::text] NOT NULL,
    suspend_grace_until timestamp with time zone,
    is_verified boolean DEFAULT false NOT NULL,
    swyp_streak integer DEFAULT 0 NOT NULL,
    swyp_streak_last_claim_at timestamp with time zone,
    onboarding_completed_at timestamp with time zone,
    stripe_connect_account_id text,
    stripe_connect_charges_enabled boolean DEFAULT false,
    stripe_connect_payouts_enabled boolean DEFAULT false,
    stripe_connect_details_submitted boolean DEFAULT false,
    stripe_connect_onboarded_at timestamp with time zone,
    totp_secret text,
    totp_enabled_at timestamp with time zone,
    totp_backup_codes text[],
    suspended_until timestamp with time zone,
    suspension_reason text,
    preferred_currency text DEFAULT 'RON'::text,
    last_digest_sent_at timestamp with time zone,
    CONSTRAINT users_age_verification_status_check CHECK ((age_verification_status = ANY (ARRAY['none'::text, 'pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text]))),
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['shopper'::text, 'creator'::text, 'moderator'::text, 'admin'::text]))),
    CONSTRAINT users_status_check CHECK ((status = ANY (ARRAY['active'::text, 'invited'::text, 'suspended'::text, 'deleted'::text, 'pending_verification'::text])))
);


--
-- Name: v_age_verified_users; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_age_verified_users AS
 SELECT user_id,
    verified_at,
    expires_at,
    method
   FROM public.user_age_verifications
  WHERE ((status = 'approved'::text) AND ((expires_at IS NULL) OR (expires_at > now())));


--
-- Name: video_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_id uuid NOT NULL,
    asset_type text NOT NULL,
    storage_provider text DEFAULT 'r2'::text NOT NULL,
    bucket text NOT NULL,
    object_key text NOT NULL,
    public_url text,
    mime_type text,
    byte_size bigint,
    checksum_sha256 text,
    width integer,
    height integer,
    duration_ms integer,
    status text DEFAULT 'pending'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT video_assets_asset_type_check CHECK ((asset_type = ANY (ARRAY['source'::text, 'transcoded'::text, 'thumbnail'::text, 'caption'::text, 'preview'::text, 'metadata'::text]))),
    CONSTRAINT video_assets_byte_size_check CHECK (((byte_size IS NULL) OR (byte_size >= 0))),
    CONSTRAINT video_assets_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms >= 0))),
    CONSTRAINT video_assets_height_check CHECK (((height IS NULL) OR (height > 0))),
    CONSTRAINT video_assets_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'uploading'::text, 'available'::text, 'failed'::text, 'deleted'::text]))),
    CONSTRAINT video_assets_storage_provider_check CHECK ((storage_provider = ANY (ARRAY['r2'::text, 's3'::text, 'minio'::text, 'local'::text]))),
    CONSTRAINT video_assets_width_check CHECK (((width IS NULL) OR (width > 0)))
);


--
-- Name: video_captions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_captions (
    id bigint NOT NULL,
    video_id uuid NOT NULL,
    lang text NOT NULL,
    text text NOT NULL,
    segments jsonb,
    is_auto boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: video_captions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_captions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_captions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.video_captions_id_seq OWNED BY public.video_captions.id;


--
-- Name: video_safety_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_safety_labels (
    video_id uuid NOT NULL,
    label text NOT NULL,
    classifier_version text DEFAULT 'v2'::text NOT NULL,
    signals jsonb DEFAULT '{}'::jsonb NOT NULL,
    reasons text[] DEFAULT ARRAY[]::text[] NOT NULL,
    reviewed_by_human boolean DEFAULT false NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by_user_id uuid,
    human_override_label text,
    classified_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT video_safety_labels_human_override_label_check CHECK ((human_override_label = ANY (ARRAY['safe'::text, 'sensitive'::text, 'adult'::text, 'blocked'::text]))),
    CONSTRAINT video_safety_labels_label_check CHECK ((label = ANY (ARRAY['safe'::text, 'sensitive'::text, 'adult'::text, 'blocked'::text])))
);


--
-- Name: video_effective_safety; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.video_effective_safety AS
 SELECT video_id,
    COALESCE(human_override_label, label) AS effective_label,
    reasons,
    reviewed_by_human
   FROM public.video_safety_labels;


--
-- Name: video_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_milestones (
    video_id uuid NOT NULL,
    milestone text NOT NULL,
    awarded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: video_processing_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_processing_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_id uuid NOT NULL,
    asset_id uuid,
    job_type text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_code text,
    error_message text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_url text,
    CONSTRAINT video_processing_jobs_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT video_processing_jobs_job_type_check CHECK ((job_type = ANY (ARRAY['probe'::text, 'transcode'::text, 'thumbnail'::text, 'caption'::text, 'moderation'::text, 'publish'::text]))),
    CONSTRAINT video_processing_jobs_max_attempts_check CHECK ((max_attempts > 0)),
    CONSTRAINT video_processing_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])))
)
WITH (autovacuum_vacuum_scale_factor='0.05', autovacuum_vacuum_threshold='100', autovacuum_analyze_scale_factor='0.05', autovacuum_analyze_threshold='100');


--
-- Name: video_product_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_product_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_id uuid NOT NULL,
    product_id uuid NOT NULL,
    creator_product_link_id uuid,
    placement text DEFAULT 'tagged'::text NOT NULL,
    start_ms integer,
    end_ms integer,
    sort_order integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT video_product_links_check CHECK (((end_ms IS NULL) OR (start_ms IS NULL) OR (end_ms >= start_ms))),
    CONSTRAINT video_product_links_end_ms_check CHECK (((end_ms IS NULL) OR (end_ms >= 0))),
    CONSTRAINT video_product_links_placement_check CHECK ((placement = ANY (ARRAY['tagged'::text, 'pinned'::text, 'chapter'::text, 'overlay'::text, 'description'::text]))),
    CONSTRAINT video_product_links_start_ms_check CHECK (((start_ms IS NULL) OR (start_ms >= 0)))
);


--
-- Name: video_product_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_product_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_id uuid NOT NULL,
    product_id uuid NOT NULL,
    user_id uuid,
    session_id text,
    vote text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT video_product_votes_actor_check CHECK (((user_id IS NOT NULL) OR (NULLIF(btrim(session_id), ''::text) IS NOT NULL))),
    CONSTRAINT video_product_votes_vote_check CHECK ((vote = ANY (ARRAY['worth_it'::text, 'not_worth_it'::text])))
);


--
-- Name: videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.videos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    creator_profile_id uuid,
    slug text,
    title text NOT NULL,
    description text,
    thumbnail_url text,
    playback_url text,
    duration_ms integer,
    width integer,
    height integer,
    visibility text DEFAULT 'draft'::text NOT NULL,
    status text DEFAULT 'uploading'::text NOT NULL,
    language_code text DEFAULT 'en'::text NOT NULL,
    product_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[] NOT NULL,
    view_count bigint DEFAULT 0 NOT NULL,
    like_count bigint DEFAULT 0 NOT NULL,
    comment_count bigint DEFAULT 0 NOT NULL,
    save_count bigint DEFAULT 0 NOT NULL,
    share_count bigint DEFAULT 0 NOT NULL,
    published_at timestamp with time zone,
    archived_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_suggestions jsonb,
    ai_hook_selected text,
    ai_caption_used boolean DEFAULT false NOT NULL,
    is_adult boolean DEFAULT false NOT NULL,
    adult_reason text,
    audio_track_id bigint,
    is_monetizable boolean DEFAULT false NOT NULL,
    is_hidden boolean DEFAULT false NOT NULL,
    hidden_at timestamp with time zone,
    scheduled_publish_at timestamp with time zone,
    is_draft boolean DEFAULT false NOT NULL,
    allow_duet boolean DEFAULT true NOT NULL,
    allow_stitch boolean DEFAULT true NOT NULL,
    allow_comments boolean DEFAULT true NOT NULL,
    embedding public.vector(1536),
    embedding_updated_at timestamp with time zone,
    search_document tsvector GENERATED ALWAYS AS ((setweight(to_tsvector('simple'::regconfig, public.f_unaccent(COALESCE(title, ''::text))), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, public.f_unaccent(COALESCE(description, ''::text))), 'B'::"char"))) STORED,
    CONSTRAINT videos_comment_count_check CHECK ((comment_count >= 0)),
    CONSTRAINT videos_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms >= 0))),
    CONSTRAINT videos_height_check CHECK (((height IS NULL) OR (height > 0))),
    CONSTRAINT videos_like_count_check CHECK ((like_count >= 0)),
    CONSTRAINT videos_save_count_check CHECK ((save_count >= 0)),
    CONSTRAINT videos_share_count_check CHECK ((share_count >= 0)),
    CONSTRAINT videos_status_check CHECK ((status = ANY (ARRAY['uploading'::text, 'processing'::text, 'ready'::text, 'failed'::text, 'archived'::text, 'deleted'::text]))),
    CONSTRAINT videos_view_count_check CHECK ((view_count >= 0)),
    CONSTRAINT videos_visibility_check CHECK ((visibility = ANY (ARRAY['draft'::text, 'unlisted'::text, 'public'::text, 'private'::text]))),
    CONSTRAINT videos_width_check CHECK (((width IS NULL) OR (width > 0)))
);


--
-- Name: video_rank_14d; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.video_rank_14d AS
 SELECT v.id AS video_id,
    v.duration_ms,
    COALESCE(( SELECT ((((((((((((((
                CASE
                    WHEN ((v.duration_ms IS NULL) OR (v.duration_ms <= 0)) THEN (0)::numeric
                    ELSE LEAST((COALESCE((sum(fe_1.watch_ms))::numeric, (0)::numeric) / (v.duration_ms)::numeric), (50)::numeric)
                END * (5)::numeric) + ((count(*) FILTER (WHERE (fe_1.event_type = 'save'::text)) * 3))::numeric) + ((count(*) FILTER (WHERE (fe_1.event_type = 'share'::text)) * 2))::numeric) + ((count(*) FILTER (WHERE (fe_1.event_type = 'like'::text)))::numeric * 1.5)) + ((count(*) FILTER (WHERE (fe_1.event_type = 'completion'::text)) * 5))::numeric) + ((count(*) FILTER (WHERE (fe_1.event_type = 'add_to_cart'::text)) * 4))::numeric) + ((count(*) FILTER (WHERE (fe_1.event_type = 'purchase'::text)) * 8))::numeric) + ((count(*) FILTER (WHERE (fe_1.event_type = 'more_like_this'::text)) * 4))::numeric) + ((count(*) FILTER (WHERE (fe_1.event_type = 'product_click'::text)) * 1))::numeric) + ((count(*) FILTER (WHERE (fe_1.event_type = 'comment'::text)) * 4))::numeric) + ((count(*) FILTER (WHERE (fe_1.event_type = 'follow'::text)) * 4))::numeric) - ((count(*) FILTER (WHERE (fe_1.event_type = 'skip_fast'::text)) * 4))::numeric) - ((count(*) FILTER (WHERE (fe_1.event_type = 'not_interested'::text)) * 6))::numeric) - ((count(*) FILTER (WHERE (fe_1.event_type = 'report'::text)) * 10))::numeric)
           FROM public.feed_events fe_1
          WHERE ((fe_1.video_id = v.id) AND (fe_1.occurred_at > (now() - '14 days'::interval)))), (0)::numeric) AS rank_score,
    count(fe.id) AS event_count_14d,
    now() AS computed_at
   FROM (public.videos v
     LEFT JOIN public.feed_events fe ON (((fe.video_id = v.id) AND (fe.occurred_at > (now() - '14 days'::interval)))))
  WHERE ((v.status = 'ready'::text) AND (v.is_hidden = false) AND (v.visibility = 'public'::text))
  GROUP BY v.id, v.duration_ms
  WITH NO DATA;


--
-- Name: video_upload_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_upload_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    video_id uuid,
    storage_provider text DEFAULT 'r2'::text NOT NULL,
    bucket text NOT NULL,
    object_key text NOT NULL,
    upload_id text,
    status text DEFAULT 'created'::text NOT NULL,
    byte_size bigint,
    content_type text,
    expires_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_url text,
    CONSTRAINT video_upload_sessions_byte_size_check CHECK (((byte_size IS NULL) OR (byte_size >= 0))),
    CONSTRAINT video_upload_sessions_status_check CHECK ((status = ANY (ARRAY['created'::text, 'uploading'::text, 'completed'::text, 'aborted'::text, 'expired'::text]))),
    CONSTRAINT video_upload_sessions_storage_provider_check CHECK ((storage_provider = ANY (ARRAY['r2'::text, 's3'::text, 'minio'::text, 'local'::text])))
);


--
-- Name: wallet_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_ledger (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    delta numeric(12,2) NOT NULL,
    balance_after numeric(12,2) NOT NULL,
    reason text NOT NULL,
    ref_type text,
    ref_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wallet_ledger_kind_check CHECK ((kind = ANY (ARRAY['xp'::text, 'coins'::text, 'reputation'::text])))
);


--
-- Name: wallet_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallet_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wallet_ledger_id_seq OWNED BY public.wallet_ledger.id;


--
-- Name: wallet_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_id uuid NOT NULL,
    type text NOT NULL,
    amount_points bigint NOT NULL,
    balance_after bigint NOT NULL,
    reason text NOT NULL,
    source_type text,
    source_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wallet_transactions_amount_points_check CHECK ((amount_points > 0)),
    CONSTRAINT wallet_transactions_type_check CHECK ((type = ANY (ARRAY['earn'::text, 'spend'::text, 'lock'::text, 'unlock'::text, 'expire'::text, 'admin_grant'::text, 'admin_deduct'::text])))
);


--
-- Name: ae_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_categories ALTER COLUMN id SET DEFAULT nextval('public.ae_categories_id_seq'::regclass);


--
-- Name: ae_oauth_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_oauth_tokens ALTER COLUMN id SET DEFAULT nextval('public.ae_oauth_tokens_id_seq'::regclass);


--
-- Name: ae_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_products ALTER COLUMN id SET DEFAULT nextval('public.ae_products_id_seq'::regclass);


--
-- Name: ae_variants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_variants ALTER COLUMN id SET DEFAULT nextval('public.ae_variants_id_seq'::regclass);


--
-- Name: audio_tracks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_tracks ALTER COLUMN id SET DEFAULT nextval('public.audio_tracks_id_seq'::regclass);


--
-- Name: checkout_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkout_audit_log ALTER COLUMN id SET DEFAULT nextval('public.checkout_audit_log_id_seq'::regclass);


--
-- Name: cron_job_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_job_runs ALTER COLUMN id SET DEFAULT nextval('public.cron_job_runs_id_seq'::regclass);


--
-- Name: cron_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_runs ALTER COLUMN id SET DEFAULT nextval('public.cron_runs_id_seq'::regclass);


--
-- Name: live_chat_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_chat_messages ALTER COLUMN id SET DEFAULT nextval('public.live_chat_messages_id_seq'::regclass);


--
-- Name: live_polls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_polls ALTER COLUMN id SET DEFAULT nextval('public.live_polls_id_seq'::regclass);


--
-- Name: live_shop_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_shop_items ALTER COLUMN id SET DEFAULT nextval('public.live_shop_items_id_seq'::regclass);


--
-- Name: oauth_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_accounts ALTER COLUMN id SET DEFAULT nextval('public.oauth_accounts_id_seq'::regclass);


--
-- Name: trending_now id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trending_now ALTER COLUMN id SET DEFAULT nextval('public.trending_now_id_seq'::regclass);


--
-- Name: video_captions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_captions ALTER COLUMN id SET DEFAULT nextval('public.video_captions_id_seq'::regclass);


--
-- Name: wallet_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger ALTER COLUMN id SET DEFAULT nextval('public.wallet_ledger_id_seq'::regclass);


--
-- Name: admin_sessions admin_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_pkey PRIMARY KEY (token);


--
-- Name: ae_categories ae_categories_ae_category_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_categories
    ADD CONSTRAINT ae_categories_ae_category_id_key UNIQUE (ae_category_id);


--
-- Name: ae_categories ae_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_categories
    ADD CONSTRAINT ae_categories_pkey PRIMARY KEY (id);


--
-- Name: ae_category_full_chain ae_category_full_chain_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_category_full_chain
    ADD CONSTRAINT ae_category_full_chain_pkey PRIMARY KEY (leaf_id);


--
-- Name: ae_import_jobs ae_import_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_import_jobs
    ADD CONSTRAINT ae_import_jobs_pkey PRIMARY KEY (product_id);


--
-- Name: ae_oauth_tokens ae_oauth_tokens_app_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_oauth_tokens
    ADD CONSTRAINT ae_oauth_tokens_app_key_key UNIQUE (app_key);


--
-- Name: ae_oauth_tokens ae_oauth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_oauth_tokens
    ADD CONSTRAINT ae_oauth_tokens_pkey PRIMARY KEY (id);


--
-- Name: ae_products ae_products_ae_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_products
    ADD CONSTRAINT ae_products_ae_product_id_key UNIQUE (ae_product_id);


--
-- Name: ae_products ae_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_products
    ADD CONSTRAINT ae_products_pkey PRIMARY KEY (id);


--
-- Name: ae_variants ae_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_variants
    ADD CONSTRAINT ae_variants_pkey PRIMARY KEY (id);


--
-- Name: ae_variants ae_variants_product_id_sku_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_variants
    ADD CONSTRAINT ae_variants_product_id_sku_id_key UNIQUE (product_id, sku_id);


--
-- Name: analytics_delivery_batches analytics_delivery_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_delivery_batches
    ADD CONSTRAINT analytics_delivery_batches_pkey PRIMARY KEY (id);


--
-- Name: anon_actions anon_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anon_actions
    ADD CONSTRAINT anon_actions_pkey PRIMARY KEY (id);


--
-- Name: anon_post_votes anon_post_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anon_post_votes
    ADD CONSTRAINT anon_post_votes_pkey PRIMARY KEY (post_id, anon_id);


--
-- Name: anon_sessions anon_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anon_sessions
    ADD CONSTRAINT anon_sessions_pkey PRIMARY KEY (anon_id);


--
-- Name: audio_tracks audio_tracks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_tracks
    ADD CONSTRAINT audio_tracks_pkey PRIMARY KEY (id);


--
-- Name: audio_tracks audio_tracks_source_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_tracks
    ADD CONSTRAINT audio_tracks_source_source_id_key UNIQUE (source, source_id);


--
-- Name: auth_accounts auth_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_accounts
    ADD CONSTRAINT auth_accounts_pkey PRIMARY KEY (id);


--
-- Name: auth_accounts auth_accounts_provider_provider_subject_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_accounts
    ADD CONSTRAINT auth_accounts_provider_provider_subject_key UNIQUE (provider, provider_subject);


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- Name: carts carts_external_cart_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_external_cart_id_key UNIQUE (external_cart_id);


--
-- Name: carts carts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_pkey PRIMARY KEY (id);


--
-- Name: challenge_entries challenge_entries_challenge_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_entries
    ADD CONSTRAINT challenge_entries_challenge_id_user_id_key UNIQUE (challenge_id, user_id);


--
-- Name: challenge_entries challenge_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_entries
    ADD CONSTRAINT challenge_entries_pkey PRIMARY KEY (id);


--
-- Name: checkout_audit_log checkout_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkout_audit_log
    ADD CONSTRAINT checkout_audit_log_pkey PRIMARY KEY (id);


--
-- Name: checkout_sessions checkout_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkout_sessions
    ADD CONSTRAINT checkout_sessions_pkey PRIMARY KEY (id);


--
-- Name: checkout_sessions checkout_sessions_provider_provider_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkout_sessions
    ADD CONSTRAINT checkout_sessions_provider_provider_session_id_key UNIQUE (provider, provider_session_id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: commerce_order_items commerce_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_order_items
    ADD CONSTRAINT commerce_order_items_pkey PRIMARY KEY (id);


--
-- Name: commerce_orders commerce_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_orders
    ADD CONSTRAINT commerce_orders_pkey PRIMARY KEY (id);


--
-- Name: commission_payout_items commission_payout_items_payout_id_commission_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_payout_items
    ADD CONSTRAINT commission_payout_items_payout_id_commission_id_key UNIQUE (payout_id, commission_id);


--
-- Name: commission_payout_items commission_payout_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_payout_items
    ADD CONSTRAINT commission_payout_items_pkey PRIMARY KEY (id);


--
-- Name: commission_payouts commission_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_payouts
    ADD CONSTRAINT commission_payouts_pkey PRIMARY KEY (id);


--
-- Name: commissions commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_pkey PRIMARY KEY (id);


--
-- Name: community_post_items community_post_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_items
    ADD CONSTRAINT community_post_items_pkey PRIMARY KEY (id);


--
-- Name: community_post_replies community_post_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_replies
    ADD CONSTRAINT community_post_replies_pkey PRIMARY KEY (parent_post_id, reply_post_id);


--
-- Name: community_post_votes community_post_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_votes
    ADD CONSTRAINT community_post_votes_pkey PRIMARY KEY (post_id, user_id);


--
-- Name: community_posts community_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts
    ADD CONSTRAINT community_posts_pkey PRIMARY KEY (id);


--
-- Name: community_posts community_posts_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts
    ADD CONSTRAINT community_posts_slug_key UNIQUE (slug);


--
-- Name: connect_transfers connect_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connect_transfers
    ADD CONSTRAINT connect_transfers_pkey PRIMARY KEY (id);


--
-- Name: conversation_participants conversation_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_pkey PRIMARY KEY (conversation_id, user_id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: creator_applications creator_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_applications
    ADD CONSTRAINT creator_applications_pkey PRIMARY KEY (id);


--
-- Name: creator_collection_items creator_collection_items_collection_id_video_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_collection_items
    ADD CONSTRAINT creator_collection_items_collection_id_video_id_key UNIQUE (collection_id, video_id);


--
-- Name: creator_collection_items creator_collection_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_collection_items
    ADD CONSTRAINT creator_collection_items_pkey PRIMARY KEY (id);


--
-- Name: creator_collections creator_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_collections
    ADD CONSTRAINT creator_collections_pkey PRIMARY KEY (id);


--
-- Name: creator_connect_accounts creator_connect_accounts_creator_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_connect_accounts
    ADD CONSTRAINT creator_connect_accounts_creator_id_provider_key UNIQUE (creator_id, provider);


--
-- Name: creator_connect_accounts creator_connect_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_connect_accounts
    ADD CONSTRAINT creator_connect_accounts_pkey PRIMARY KEY (id);


--
-- Name: creator_connect_accounts creator_connect_accounts_provider_provider_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_connect_accounts
    ADD CONSTRAINT creator_connect_accounts_provider_provider_account_id_key UNIQUE (provider, provider_account_id);


--
-- Name: creator_mission_submissions creator_mission_submissions_mission_id_user_id_video_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_mission_submissions
    ADD CONSTRAINT creator_mission_submissions_mission_id_user_id_video_id_key UNIQUE (mission_id, user_id, video_id);


--
-- Name: creator_mission_submissions creator_mission_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_mission_submissions
    ADD CONSTRAINT creator_mission_submissions_pkey PRIMARY KEY (id);


--
-- Name: creator_missions creator_missions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_missions
    ADD CONSTRAINT creator_missions_pkey PRIMARY KEY (id);


--
-- Name: creator_missions creator_missions_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_missions
    ADD CONSTRAINT creator_missions_slug_key UNIQUE (slug);


--
-- Name: creator_product_links creator_product_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_product_links
    ADD CONSTRAINT creator_product_links_pkey PRIMARY KEY (id);


--
-- Name: creator_profiles creator_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_profiles
    ADD CONSTRAINT creator_profiles_pkey PRIMARY KEY (id);


--
-- Name: creator_profiles creator_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_profiles
    ADD CONSTRAINT creator_profiles_user_id_key UNIQUE (user_id);


--
-- Name: creators creators_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creators
    ADD CONSTRAINT creators_email_key UNIQUE (email);


--
-- Name: creators creators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creators
    ADD CONSTRAINT creators_pkey PRIMARY KEY (id);


--
-- Name: cron_job_runs cron_job_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_job_runs
    ADD CONSTRAINT cron_job_runs_pkey PRIMARY KEY (id);


--
-- Name: cron_runs cron_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_runs
    ADD CONSTRAINT cron_runs_pkey PRIMARY KEY (id);


--
-- Name: customer_sessions customer_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_sessions
    ADD CONSTRAINT customer_sessions_pkey PRIMARY KEY (id);


--
-- Name: customer_sessions customer_sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_sessions
    ADD CONSTRAINT customer_sessions_token_key UNIQUE (token);


--
-- Name: customers customers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_email_key UNIQUE (email);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: daily_challenges daily_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenges
    ADD CONSTRAINT daily_challenges_pkey PRIMARY KEY (id);


--
-- Name: daily_mission_templates daily_mission_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_mission_templates
    ADD CONSTRAINT daily_mission_templates_pkey PRIMARY KEY (id);


--
-- Name: daily_mission_templates daily_mission_templates_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_mission_templates
    ADD CONSTRAINT daily_mission_templates_slug_key UNIQUE (slug);


--
-- Name: email_unsubscribes email_unsubscribes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribes
    ADD CONSTRAINT email_unsubscribes_pkey PRIMARY KEY (email_lower);


--
-- Name: event_outbox event_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_outbox
    ADD CONSTRAINT event_outbox_pkey PRIMARY KEY (id);


--
-- Name: feed_events feed_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_events
    ADD CONSTRAINT feed_events_pkey PRIMARY KEY (id);


--
-- Name: feed_items feed_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_items
    ADD CONSTRAINT feed_items_pkey PRIMARY KEY (id);


--
-- Name: follows follows_follower_user_id_following_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_user_id_following_user_id_key UNIQUE (follower_user_id, following_user_id);


--
-- Name: follows follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_pkey PRIMARY KEY (id);


--
-- Name: fulfillment_shipments fulfillment_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfillment_shipments
    ADD CONSTRAINT fulfillment_shipments_pkey PRIMARY KEY (id);


--
-- Name: fx_rates fx_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_rates
    ADD CONSTRAINT fx_rates_pkey PRIMARY KEY (base, quote);


--
-- Name: likes likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_pkey PRIMARY KEY (id);


--
-- Name: live_chat_messages live_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_chat_messages
    ADD CONSTRAINT live_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: live_polls live_polls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_polls
    ADD CONSTRAINT live_polls_pkey PRIMARY KEY (id);


--
-- Name: live_shop_items live_shop_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_shop_items
    ADD CONSTRAINT live_shop_items_pkey PRIMARY KEY (id);


--
-- Name: live_streams live_streams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_streams
    ADD CONSTRAINT live_streams_pkey PRIMARY KEY (id);


--
-- Name: live_streams live_streams_stream_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_streams
    ADD CONSTRAINT live_streams_stream_key_key UNIQUE (stream_key);


--
-- Name: marketplace_merchants marketplace_merchants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_merchants
    ADD CONSTRAINT marketplace_merchants_pkey PRIMARY KEY (id);


--
-- Name: marketplace_product_offers marketplace_product_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_product_offers
    ADD CONSTRAINT marketplace_product_offers_pkey PRIMARY KEY (id);


--
-- Name: marketplace_product_variants marketplace_product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_product_variants
    ADD CONSTRAINT marketplace_product_variants_pkey PRIMARY KEY (id);


--
-- Name: marketplace_products marketplace_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_products
    ADD CONSTRAINT marketplace_products_pkey PRIMARY KEY (id);


--
-- Name: media_assets media_assets_bucket_object_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_bucket_object_key_key UNIQUE (bucket, object_key);


--
-- Name: media_assets media_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: moderation_actions moderation_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_pkey PRIMARY KEY (id);


--
-- Name: moderation_cases moderation_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_cases
    ADD CONSTRAINT moderation_cases_pkey PRIMARY KEY (id);


--
-- Name: moderation_reports moderation_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_reports
    ADD CONSTRAINT moderation_reports_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: oauth_accounts oauth_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_accounts
    ADD CONSTRAINT oauth_accounts_pkey PRIMARY KEY (id);


--
-- Name: oauth_accounts oauth_accounts_provider_provider_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_accounts
    ADD CONSTRAINT oauth_accounts_provider_provider_user_id_key UNIQUE (provider, provider_user_id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: payment_customers payment_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_customers
    ADD CONSTRAINT payment_customers_pkey PRIMARY KEY (id);


--
-- Name: payment_customers payment_customers_provider_provider_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_customers
    ADD CONSTRAINT payment_customers_provider_provider_customer_id_key UNIQUE (provider, provider_customer_id);


--
-- Name: payment_customers payment_customers_user_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_customers
    ADD CONSTRAINT payment_customers_user_id_provider_key UNIQUE (user_id, provider);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_provider_provider_payment_id_transacti_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_provider_provider_payment_id_transacti_key UNIQUE (provider, provider_payment_id, transaction_type);


--
-- Name: processed_stripe_events processed_stripe_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processed_stripe_events
    ADD CONSTRAINT processed_stripe_events_pkey PRIMARY KEY (event_id);


--
-- Name: product_reviews product_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_pkey PRIMARY KEY (id);


--
-- Name: product_reviews product_reviews_product_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_product_id_user_id_key UNIQUE (product_id, user_id);


--
-- Name: product_safety_labels product_safety_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_safety_labels
    ADD CONSTRAINT product_safety_labels_pkey PRIMARY KEY (product_id);


--
-- Name: product_topics product_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_topics
    ADD CONSTRAINT product_topics_pkey PRIMARY KEY (product_id, topic_id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: redis_stream_checkpoints redis_stream_checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redis_stream_checkpoints
    ADD CONSTRAINT redis_stream_checkpoints_pkey PRIMARY KEY (stream_name, consumer_group, consumer_name);


--
-- Name: referral_attributions referral_attributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_attributions
    ADD CONSTRAINT referral_attributions_pkey PRIMARY KEY (invitee_user_id);


--
-- Name: referral_codes referral_codes_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_code_unique UNIQUE (code);


--
-- Name: referral_codes referral_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_pkey PRIMARY KEY (user_id);


--
-- Name: review_helpful_votes review_helpful_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_helpful_votes
    ADD CONSTRAINT review_helpful_votes_pkey PRIMARY KEY (review_id, user_id);


--
-- Name: reward_events reward_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_events
    ADD CONSTRAINT reward_events_pkey PRIMARY KEY (id);


--
-- Name: reward_rules reward_rules_action_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_rules
    ADD CONSTRAINT reward_rules_action_key UNIQUE (action);


--
-- Name: reward_rules reward_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_rules
    ADD CONSTRAINT reward_rules_pkey PRIMARY KEY (id);


--
-- Name: saved_products saved_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_products
    ADD CONSTRAINT saved_products_pkey PRIMARY KEY (id);


--
-- Name: saved_products saved_products_user_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_products
    ADD CONSTRAINT saved_products_user_id_product_id_key UNIQUE (user_id, product_id);


--
-- Name: saves saves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saves
    ADD CONSTRAINT saves_pkey PRIMARY KEY (id);


--
-- Name: saves saves_user_id_video_id_collection_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saves
    ADD CONSTRAINT saves_user_id_video_id_collection_name_key UNIQUE (user_id, video_id, collection_name);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: seller_sessions seller_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_sessions
    ADD CONSTRAINT seller_sessions_pkey PRIMARY KEY (id);


--
-- Name: seller_sessions seller_sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_sessions
    ADD CONSTRAINT seller_sessions_token_key UNIQUE (token);


--
-- Name: sellers sellers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sellers
    ADD CONSTRAINT sellers_email_key UNIQUE (email);


--
-- Name: sellers sellers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sellers
    ADD CONSTRAINT sellers_pkey PRIMARY KEY (id);


--
-- Name: service_api_keys service_api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_api_keys
    ADD CONSTRAINT service_api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: service_api_keys service_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_api_keys
    ADD CONSTRAINT service_api_keys_pkey PRIMARY KEY (id);


--
-- Name: shares shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shares
    ADD CONSTRAINT shares_pkey PRIMARY KEY (id);


--
-- Name: supplier_order_items supplier_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_order_items
    ADD CONSTRAINT supplier_order_items_pkey PRIMARY KEY (id);


--
-- Name: supplier_orders supplier_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_orders
    ADD CONSTRAINT supplier_orders_pkey PRIMARY KEY (id);


--
-- Name: supplier_webhook_events supplier_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_webhook_events
    ADD CONSTRAINT supplier_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: swyp_wallets swyp_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swyp_wallets
    ADD CONSTRAINT swyp_wallets_pkey PRIMARY KEY (id);


--
-- Name: swyp_wallets swyp_wallets_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swyp_wallets
    ADD CONSTRAINT swyp_wallets_user_id_key UNIQUE (user_id);


--
-- Name: taxonomy_nodes taxonomy_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_nodes
    ADD CONSTRAINT taxonomy_nodes_pkey PRIMARY KEY (slug);


--
-- Name: taxonomy_translations taxonomy_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_translations
    ADD CONSTRAINT taxonomy_translations_pkey PRIMARY KEY (node_slug, locale);


--
-- Name: topics topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_pkey PRIMARY KEY (id);


--
-- Name: tracking_events tracking_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracking_events
    ADD CONSTRAINT tracking_events_pkey PRIMARY KEY (id);


--
-- Name: trending_now trending_now_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trending_now
    ADD CONSTRAINT trending_now_pkey PRIMARY KEY (id);


--
-- Name: user_addresses user_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_pkey PRIMARY KEY (id);


--
-- Name: user_age_verifications user_age_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_age_verifications
    ADD CONSTRAINT user_age_verifications_pkey PRIMARY KEY (user_id);


--
-- Name: user_collection_items user_collection_items_collection_id_video_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_collection_items
    ADD CONSTRAINT user_collection_items_collection_id_video_id_key UNIQUE (collection_id, video_id);


--
-- Name: user_collection_items user_collection_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_collection_items
    ADD CONSTRAINT user_collection_items_pkey PRIMARY KEY (id);


--
-- Name: user_collections user_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_collections
    ADD CONSTRAINT user_collections_pkey PRIMARY KEY (id);


--
-- Name: user_daily_missions user_daily_missions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_daily_missions
    ADD CONSTRAINT user_daily_missions_pkey PRIMARY KEY (id);


--
-- Name: user_daily_missions user_daily_missions_user_id_template_id_day_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_daily_missions
    ADD CONSTRAINT user_daily_missions_user_id_template_id_day_key UNIQUE (user_id, template_id, day);


--
-- Name: user_feed_state user_feed_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_feed_state
    ADD CONSTRAINT user_feed_state_pkey PRIMARY KEY (user_id, feed_type);


--
-- Name: user_hidden_videos user_hidden_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hidden_videos
    ADD CONSTRAINT user_hidden_videos_pkey PRIMARY KEY (id);


--
-- Name: user_hidden_videos user_hidden_videos_user_id_video_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hidden_videos
    ADD CONSTRAINT user_hidden_videos_user_id_video_id_key UNIQUE (user_id, video_id);


--
-- Name: user_interests user_interests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_pkey PRIMARY KEY (id);


--
-- Name: user_interests user_interests_user_id_topic_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_user_id_topic_key UNIQUE (user_id, topic);


--
-- Name: user_risk_scores user_risk_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_risk_scores
    ADD CONSTRAINT user_risk_scores_pkey PRIMARY KEY (user_id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_session_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_session_token_hash_key UNIQUE (session_token_hash);


--
-- Name: user_streaks user_streaks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_streaks
    ADD CONSTRAINT user_streaks_pkey PRIMARY KEY (user_id);


--
-- Name: user_strikes user_strikes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_strikes
    ADD CONSTRAINT user_strikes_pkey PRIMARY KEY (id);


--
-- Name: user_wallets user_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_wallets
    ADD CONSTRAINT user_wallets_pkey PRIMARY KEY (user_id);


--
-- Name: user_watch_events user_watch_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_watch_events
    ADD CONSTRAINT user_watch_events_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: video_assets video_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_assets
    ADD CONSTRAINT video_assets_pkey PRIMARY KEY (id);


--
-- Name: video_assets video_assets_storage_provider_bucket_object_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_assets
    ADD CONSTRAINT video_assets_storage_provider_bucket_object_key_key UNIQUE (storage_provider, bucket, object_key);


--
-- Name: video_captions video_captions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_captions
    ADD CONSTRAINT video_captions_pkey PRIMARY KEY (id);


--
-- Name: video_captions video_captions_video_id_lang_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_captions
    ADD CONSTRAINT video_captions_video_id_lang_key UNIQUE (video_id, lang);


--
-- Name: video_milestones video_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_milestones
    ADD CONSTRAINT video_milestones_pkey PRIMARY KEY (video_id, milestone);


--
-- Name: video_processing_jobs video_processing_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_processing_jobs
    ADD CONSTRAINT video_processing_jobs_pkey PRIMARY KEY (id);


--
-- Name: video_product_links video_product_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_product_links
    ADD CONSTRAINT video_product_links_pkey PRIMARY KEY (id);


--
-- Name: video_product_votes video_product_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_product_votes
    ADD CONSTRAINT video_product_votes_pkey PRIMARY KEY (id);


--
-- Name: video_safety_labels video_safety_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_safety_labels
    ADD CONSTRAINT video_safety_labels_pkey PRIMARY KEY (video_id);


--
-- Name: video_upload_sessions video_upload_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_upload_sessions
    ADD CONSTRAINT video_upload_sessions_pkey PRIMARY KEY (id);


--
-- Name: videos videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_pkey PRIMARY KEY (id);


--
-- Name: wallet_ledger wallet_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_pkey PRIMARY KEY (id);


--
-- Name: wallet_transactions wallet_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);


--
-- Name: admin_sessions_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_sessions_expires_idx ON public.admin_sessions USING btree (expires_at);


--
-- Name: ae_import_jobs_failed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ae_import_jobs_failed_idx ON public.ae_import_jobs USING btree (status, attempts) WHERE (status = 'failed'::text);


--
-- Name: ae_import_jobs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ae_import_jobs_status_idx ON public.ae_import_jobs USING btree (status, updated_at DESC);


--
-- Name: analytics_delivery_batches_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analytics_delivery_batches_status_idx ON public.analytics_delivery_batches USING btree (destination, status, created_at DESC);


--
-- Name: auth_accounts_email_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_accounts_email_lower_idx ON public.auth_accounts USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: auth_accounts_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_accounts_user_idx ON public.auth_accounts USING btree (user_id, provider);


--
-- Name: cart_items_cart_external_variant_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cart_items_cart_external_variant_uidx ON public.cart_items USING btree (cart_id, external_product_id, COALESCE(external_variant_id, ''::text)) WHERE ((metadata ->> 'mergeable'::text) = 'true'::text);


--
-- Name: cart_items_cart_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cart_items_cart_idx ON public.cart_items USING btree (cart_id, created_at);


--
-- Name: carts_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX carts_user_status_idx ON public.carts USING btree (user_id, status, created_at DESC) WHERE (user_id IS NOT NULL);


--
-- Name: challenge_entries_challenge_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX challenge_entries_challenge_score_idx ON public.challenge_entries USING btree (challenge_id, score DESC);


--
-- Name: challenge_entries_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX challenge_entries_user_idx ON public.challenge_entries USING btree (user_id, created_at DESC);


--
-- Name: checkout_audit_log_event_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkout_audit_log_event_created_at_idx ON public.checkout_audit_log USING btree (event, created_at DESC);


--
-- Name: checkout_sessions_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkout_sessions_order_idx ON public.checkout_sessions USING btree (order_id) WHERE (order_id IS NOT NULL);


--
-- Name: checkout_sessions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkout_sessions_user_idx ON public.checkout_sessions USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);


--
-- Name: comments_parent_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_parent_created_at_idx ON public.comments USING btree (parent_comment_id, created_at) WHERE (parent_comment_id IS NOT NULL);


--
-- Name: comments_user_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_user_created_at_idx ON public.comments USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);


--
-- Name: comments_video_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_video_created_at_idx ON public.comments USING btree (video_id, created_at DESC);


--
-- Name: commerce_order_items_creator_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commerce_order_items_creator_idx ON public.commerce_order_items USING btree (creator_id, created_at DESC) WHERE (creator_id IS NOT NULL);


--
-- Name: commerce_order_items_external_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX commerce_order_items_external_uidx ON public.commerce_order_items USING btree (order_id, external_line_item_id) WHERE (external_line_item_id IS NOT NULL);


--
-- Name: commerce_order_items_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commerce_order_items_order_idx ON public.commerce_order_items USING btree (order_id, created_at);


--
-- Name: commerce_order_items_payout_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commerce_order_items_payout_status_idx ON public.commerce_order_items USING btree (payout_status) WHERE (payout_status IS NOT NULL);


--
-- Name: commerce_order_items_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commerce_order_items_product_idx ON public.commerce_order_items USING btree (product_id, created_at DESC) WHERE (product_id IS NOT NULL);


--
-- Name: commerce_order_items_seller_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commerce_order_items_seller_status_idx ON public.commerce_order_items USING btree (((metadata ->> 'seller_id'::text)), source_status) WHERE (metadata ? 'seller_id'::text);


--
-- Name: commerce_orders_buyer_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commerce_orders_buyer_created_at_idx ON public.commerce_orders USING btree (buyer_user_id, created_at DESC) WHERE (buyer_user_id IS NOT NULL);


--
-- Name: commerce_orders_external_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX commerce_orders_external_uidx ON public.commerce_orders USING btree (merchant_id, external_order_id) WHERE ((merchant_id IS NOT NULL) AND (external_order_id IS NOT NULL));


--
-- Name: commerce_orders_pending_cart_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX commerce_orders_pending_cart_uidx ON public.commerce_orders USING btree (((metadata ->> 'cart_id'::text))) WHERE ((status = 'pending'::text) AND (metadata ? 'cart_id'::text));


--
-- Name: commerce_orders_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commerce_orders_status_idx ON public.commerce_orders USING btree (status, created_at DESC);


--
-- Name: commission_payout_items_commission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commission_payout_items_commission_idx ON public.commission_payout_items USING btree (commission_id);


--
-- Name: commission_payouts_connect_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commission_payouts_connect_account_idx ON public.commission_payouts USING btree (connect_account_id, status) WHERE (connect_account_id IS NOT NULL);


--
-- Name: commission_payouts_creator_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commission_payouts_creator_status_idx ON public.commission_payouts USING btree (creator_id, status, created_at DESC);


--
-- Name: commission_payouts_provider_payout_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX commission_payouts_provider_payout_uidx ON public.commission_payouts USING btree (provider, provider_payout_id) WHERE (provider_payout_id IS NOT NULL);


--
-- Name: commissions_connect_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commissions_connect_account_idx ON public.commissions USING btree (connect_account_id, status, created_at DESC) WHERE (connect_account_id IS NOT NULL);


--
-- Name: commissions_creator_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commissions_creator_status_idx ON public.commissions USING btree (creator_id, status, created_at DESC);


--
-- Name: commissions_external_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commissions_external_order_idx ON public.commissions USING btree (external_order_id) WHERE (external_order_id IS NOT NULL);


--
-- Name: commissions_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commissions_order_idx ON public.commissions USING btree (commerce_order_id, created_at DESC) WHERE (commerce_order_id IS NOT NULL);


--
-- Name: commissions_order_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commissions_order_item_idx ON public.commissions USING btree (commerce_order_item_id) WHERE (commerce_order_item_id IS NOT NULL);


--
-- Name: commissions_video_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commissions_video_idx ON public.commissions USING btree (video_id, created_at DESC) WHERE (video_id IS NOT NULL);


--
-- Name: connect_transfers_account_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connect_transfers_account_status_idx ON public.connect_transfers USING btree (connect_account_id, status, created_at DESC);


--
-- Name: connect_transfers_commission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connect_transfers_commission_idx ON public.connect_transfers USING btree (commission_id) WHERE (commission_id IS NOT NULL);


--
-- Name: connect_transfers_provider_transfer_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX connect_transfers_provider_transfer_uidx ON public.connect_transfers USING btree (provider, provider_transfer_id) WHERE (provider_transfer_id IS NOT NULL);


--
-- Name: conv_participants_user_conv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conv_participants_user_conv_idx ON public.conversation_participants USING btree (user_id, conversation_id);


--
-- Name: conversations_last_msg_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_last_msg_idx ON public.conversations USING btree (last_message_at DESC) WHERE (last_message_at IS NOT NULL);


--
-- Name: creator_applications_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_applications_status_idx ON public.creator_applications USING btree (status, created_at DESC);


--
-- Name: creator_applications_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_applications_user_idx ON public.creator_applications USING btree (user_id, created_at DESC);


--
-- Name: creator_collection_items_collection_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_collection_items_collection_sort_idx ON public.creator_collection_items USING btree (collection_id, sort_order, created_at DESC);


--
-- Name: creator_collection_items_video_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_collection_items_video_idx ON public.creator_collection_items USING btree (video_id);


--
-- Name: creator_collections_creator_slug_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX creator_collections_creator_slug_uidx ON public.creator_collections USING btree (creator_id, slug) WHERE (slug IS NOT NULL);


--
-- Name: creator_collections_creator_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_collections_creator_sort_idx ON public.creator_collections USING btree (creator_id, sort_order, created_at DESC);


--
-- Name: creator_connect_accounts_creator_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_connect_accounts_creator_idx ON public.creator_connect_accounts USING btree (creator_id, account_status);


--
-- Name: creator_connect_accounts_payouts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_connect_accounts_payouts_idx ON public.creator_connect_accounts USING btree (payouts_enabled, account_status);


--
-- Name: creator_product_links_creator_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_product_links_creator_idx ON public.creator_product_links USING btree (creator_id, status, created_at DESC);


--
-- Name: creator_product_links_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_product_links_product_idx ON public.creator_product_links USING btree (product_id, status);


--
-- Name: creator_product_links_tracking_code_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX creator_product_links_tracking_code_uidx ON public.creator_product_links USING btree (tracking_code) WHERE (tracking_code IS NOT NULL);


--
-- Name: creator_profiles_handle_lower_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX creator_profiles_handle_lower_uidx ON public.creator_profiles USING btree (lower(handle));


--
-- Name: creator_profiles_verification_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_profiles_verification_status_idx ON public.creator_profiles USING btree (verification_status, created_at DESC);


--
-- Name: creators_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creators_status_idx ON public.creators USING btree (status, created_at DESC);


--
-- Name: cron_job_runs_job_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cron_job_runs_job_started_idx ON public.cron_job_runs USING btree (job_name, started_at DESC);


--
-- Name: cron_job_runs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cron_job_runs_status_idx ON public.cron_job_runs USING btree (status) WHERE (status = 'failed'::text);


--
-- Name: daily_challenges_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX daily_challenges_active_idx ON public.daily_challenges USING btree (status, starts_at DESC) WHERE (status = 'active'::text);


--
-- Name: event_outbox_dispatch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_outbox_dispatch_idx ON public.event_outbox USING btree (status, available_at, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));


--
-- Name: event_outbox_idempotency_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX event_outbox_idempotency_uidx ON public.event_outbox USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: event_outbox_payload_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_outbox_payload_gin_idx ON public.event_outbox USING gin (payload jsonb_path_ops);


--
-- Name: event_outbox_stream_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_outbox_stream_idx ON public.event_outbox USING btree (stream_name, created_at DESC);


--
-- Name: feed_events_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feed_events_actor_idx ON public.feed_events USING btree (actor_user_id, occurred_at DESC) WHERE (actor_user_id IS NOT NULL);


--
-- Name: feed_events_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feed_events_expires_at_idx ON public.feed_events USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: feed_events_global_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feed_events_global_idx ON public.feed_events USING btree (audience, score DESC, occurred_at DESC);


--
-- Name: feed_events_occurred_at_brin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feed_events_occurred_at_brin ON public.feed_events USING brin (occurred_at);


--
-- Name: feed_events_session_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feed_events_session_recent_idx ON public.feed_events USING btree (session_id, occurred_at DESC) WHERE (session_id IS NOT NULL);


--
-- Name: feed_events_type_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feed_events_type_occurred_at_idx ON public.feed_events USING btree (event_type, occurred_at DESC);


--
-- Name: feed_events_user_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feed_events_user_recent_idx ON public.feed_events USING btree (actor_user_id, occurred_at DESC) WHERE (actor_user_id IS NOT NULL);


--
-- Name: feed_events_video_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feed_events_video_idx ON public.feed_events USING btree (video_id, occurred_at DESC) WHERE (video_id IS NOT NULL);


--
-- Name: feed_events_video_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feed_events_video_type_idx ON public.feed_events USING btree (video_id, event_type) WHERE (video_id IS NOT NULL);


--
-- Name: feed_items_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feed_items_expires_idx ON public.feed_items USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: feed_items_global_rank_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feed_items_global_rank_idx ON public.feed_items USING btree (feed_type, score DESC, available_at DESC) WHERE ((user_id IS NULL) AND (status = 'active'::text));


--
-- Name: feed_items_user_feed_rank_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feed_items_user_feed_rank_idx ON public.feed_items USING btree (user_id, feed_type, score DESC, available_at DESC) WHERE ((user_id IS NOT NULL) AND (status = 'active'::text));


--
-- Name: feed_items_video_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feed_items_video_idx ON public.feed_items USING btree (video_id, created_at DESC);


--
-- Name: follows_follower_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follows_follower_created_at_idx ON public.follows USING btree (follower_user_id, created_at DESC);


--
-- Name: follows_following_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follows_following_created_at_idx ON public.follows USING btree (following_user_id, created_at DESC);


--
-- Name: fulfillment_shipments_order_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fulfillment_shipments_order_status_idx ON public.fulfillment_shipments USING btree (commerce_order_id, status, created_at DESC);


--
-- Name: fulfillment_shipments_tracking_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fulfillment_shipments_tracking_idx ON public.fulfillment_shipments USING btree (carrier, tracking_number) WHERE (tracking_number IS NOT NULL);


--
-- Name: idx_ae_chain_ids_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ae_chain_ids_gin ON public.ae_category_full_chain USING gin (chain_ids);


--
-- Name: idx_ae_chain_root; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ae_chain_root ON public.ae_category_full_chain USING btree (root_id);


--
-- Name: idx_ae_prod_non_adult; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ae_prod_non_adult ON public.ae_products USING btree (id) WHERE (is_adult = false);


--
-- Name: idx_age_verif_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_age_verif_active ON public.user_age_verifications USING btree (user_id) WHERE (status = 'approved'::text);


--
-- Name: idx_age_verif_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_age_verif_pending ON public.user_age_verifications USING btree (created_at DESC) WHERE (status = 'pending'::text);


--
-- Name: idx_anon_actions_anon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anon_actions_anon ON public.anon_actions USING btree (anon_id, created_at DESC);


--
-- Name: idx_anon_actions_attributed_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anon_actions_attributed_user_id ON public.anon_actions USING btree (attributed_user_id);


--
-- Name: idx_anon_actions_pending_attrib; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anon_actions_pending_attrib ON public.anon_actions USING btree (anon_id) WHERE (attributed_user_id IS NULL);


--
-- Name: idx_anon_actions_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anon_actions_target ON public.anon_actions USING btree (target_kind, target_id);


--
-- Name: idx_anon_post_votes_anon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anon_post_votes_anon ON public.anon_post_votes USING btree (anon_id) WHERE (attributed_user_id IS NULL);


--
-- Name: idx_anon_post_votes_attributed_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anon_post_votes_attributed_user_id ON public.anon_post_votes USING btree (attributed_user_id);


--
-- Name: idx_anon_post_votes_post_option; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anon_post_votes_post_option ON public.anon_post_votes USING btree (post_id, option_key);


--
-- Name: idx_anon_sessions_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anon_sessions_last_seen ON public.anon_sessions USING btree (last_seen_at DESC);


--
-- Name: idx_anon_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anon_sessions_user ON public.anon_sessions USING btree (became_user_id) WHERE (became_user_id IS NOT NULL);


--
-- Name: idx_audio_tracks_genre; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audio_tracks_genre ON public.audio_tracks USING btree (genre) WHERE (is_active = true);


--
-- Name: idx_audio_tracks_popularity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audio_tracks_popularity ON public.audio_tracks USING btree (popularity DESC) WHERE (is_active = true);


--
-- Name: idx_audio_tracks_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audio_tracks_tags ON public.audio_tracks USING gin (tags);


--
-- Name: idx_audio_tracks_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audio_tracks_title_trgm ON public.audio_tracks USING gin (title public.gin_trgm_ops);


--
-- Name: idx_cart_items_marketplace_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cart_items_marketplace_product_id ON public.cart_items USING btree (marketplace_product_id);


--
-- Name: idx_cart_items_marketplace_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cart_items_marketplace_variant_id ON public.cart_items USING btree (marketplace_variant_id);


--
-- Name: idx_challenge_entries_video_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenge_entries_video_id ON public.challenge_entries USING btree (video_id);


--
-- Name: idx_commerce_order_items_creator_product_link_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_order_items_creator_product_link_id ON public.commerce_order_items USING btree (creator_product_link_id);


--
-- Name: idx_commerce_order_items_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_order_items_variant_id ON public.commerce_order_items USING btree (variant_id);


--
-- Name: idx_commerce_order_items_video_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_order_items_video_id ON public.commerce_order_items USING btree (video_id);


--
-- Name: idx_commerce_orders_source_share_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commerce_orders_source_share_id ON public.commerce_orders USING btree (source_share_id);


--
-- Name: idx_commissions_buyer_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_buyer_user_id ON public.commissions USING btree (buyer_user_id);


--
-- Name: idx_commissions_payment_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_payment_transaction_id ON public.commissions USING btree (payment_transaction_id);


--
-- Name: idx_commissions_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_product_id ON public.commissions USING btree (product_id);


--
-- Name: idx_commissions_source_share_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_source_share_id ON public.commissions USING btree (source_share_id);


--
-- Name: idx_community_post_replies_reply_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_post_replies_reply_post_id ON public.community_post_replies USING btree (reply_post_id);


--
-- Name: idx_community_post_votes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_post_votes_user_id ON public.community_post_votes USING btree (user_id);


--
-- Name: idx_community_posts_video_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_posts_video_id ON public.community_posts USING btree (video_id);


--
-- Name: idx_connect_transfers_payout_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connect_transfers_payout_id ON public.connect_transfers USING btree (payout_id);


--
-- Name: idx_conversations_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_created_by ON public.conversations USING btree (created_by);


--
-- Name: idx_creator_applications_reviewer_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_applications_reviewer_user_id ON public.creator_applications USING btree (reviewer_user_id);


--
-- Name: idx_creator_connect_accounts_creator_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_connect_accounts_creator_profile_id ON public.creator_connect_accounts USING btree (creator_profile_id);


--
-- Name: idx_creator_mission_submissions_video_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_mission_submissions_video_id ON public.creator_mission_submissions USING btree (video_id);


--
-- Name: idx_creator_product_links_offer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creator_product_links_offer_id ON public.creator_product_links USING btree (offer_id);


--
-- Name: idx_cron_runs_job_name_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cron_runs_job_name_started ON public.cron_runs USING btree (job_name, started_at DESC);


--
-- Name: idx_customer_sessions_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_sessions_customer_id ON public.customer_sessions USING btree (customer_id);


--
-- Name: idx_customer_sessions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_sessions_expires ON public.customer_sessions USING btree (expires_at);


--
-- Name: idx_customer_sessions_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_sessions_token ON public.customer_sessions USING btree (token);


--
-- Name: idx_customers_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_email ON public.customers USING btree (email);


--
-- Name: idx_email_unsubscribes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_unsubscribes_user_id ON public.email_unsubscribes USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_event_outbox_actor_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_outbox_actor_user_id ON public.event_outbox USING btree (actor_user_id);


--
-- Name: idx_feed_events_comment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_events_comment_id ON public.feed_events USING btree (comment_id);


--
-- Name: idx_feed_items_creator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_items_creator_id ON public.feed_items USING btree (creator_id);


--
-- Name: idx_feed_items_source_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_items_source_event_id ON public.feed_items USING btree (source_event_id);


--
-- Name: idx_fulfillment_shipments_supplier_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fulfillment_shipments_supplier_order_id ON public.fulfillment_shipments USING btree (supplier_order_id);


--
-- Name: idx_ledger_reason; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_reason ON public.wallet_ledger USING btree (reason, created_at DESC);


--
-- Name: idx_ledger_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_ref ON public.wallet_ledger USING btree (ref_type, ref_id) WHERE (ref_id IS NOT NULL);


--
-- Name: idx_ledger_user_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_user_recent ON public.wallet_ledger USING btree (user_id, created_at DESC);


--
-- Name: idx_live_chat_stream_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_live_chat_stream_time ON public.live_chat_messages USING btree (stream_id, created_at DESC);


--
-- Name: idx_live_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_live_creator ON public.live_streams USING btree (creator_id);


--
-- Name: idx_live_shop_stream; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_live_shop_stream ON public.live_shop_items USING btree (stream_id);


--
-- Name: idx_live_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_live_status ON public.live_streams USING btree (status, scheduled_at);


--
-- Name: idx_marketplace_products_taxonomy_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_products_taxonomy_slug ON public.marketplace_products USING btree (taxonomy_node_slug);


--
-- Name: idx_media_assets_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_assets_owner_id ON public.media_assets USING btree (owner_id) WHERE (owner_id IS NOT NULL);


--
-- Name: idx_messages_reply_to_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_reply_to_message_id ON public.messages USING btree (reply_to_message_id);


--
-- Name: idx_messages_sender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sender_id ON public.messages USING btree (sender_id);


--
-- Name: idx_mission_templates_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mission_templates_active ON public.daily_mission_templates USING btree (is_active, min_level) WHERE (is_active = true);


--
-- Name: idx_missions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_missions_active ON public.creator_missions USING btree (status, ends_at DESC) WHERE (status = 'active'::text);


--
-- Name: idx_missions_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_missions_product ON public.creator_missions USING btree (product_id) WHERE (product_id IS NOT NULL);


--
-- Name: idx_missions_seller; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_missions_seller ON public.creator_missions USING btree (seller_id) WHERE (seller_id IS NOT NULL);


--
-- Name: idx_moderation_actions_actor_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_actions_actor_user_id ON public.moderation_actions USING btree (actor_user_id);


--
-- Name: idx_moderation_actions_target_comment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_actions_target_comment_id ON public.moderation_actions USING btree (target_comment_id);


--
-- Name: idx_moderation_actions_target_video_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_actions_target_video_id ON public.moderation_actions USING btree (target_video_id);


--
-- Name: idx_moderation_cases_opened_by_report_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_cases_opened_by_report_id ON public.moderation_cases USING btree (opened_by_report_id);


--
-- Name: idx_moderation_cases_resolved_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_cases_resolved_by_user_id ON public.moderation_cases USING btree (resolved_by_user_id);


--
-- Name: idx_moderation_cases_target_comment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_cases_target_comment_id ON public.moderation_cases USING btree (target_comment_id);


--
-- Name: idx_moderation_cases_target_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_cases_target_user_id ON public.moderation_cases USING btree (target_user_id);


--
-- Name: idx_moderation_cases_target_video_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_cases_target_video_id ON public.moderation_cases USING btree (target_video_id);


--
-- Name: idx_moderation_reports_target_comment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_reports_target_comment_id ON public.moderation_reports USING btree (target_comment_id);


--
-- Name: idx_moderation_reports_target_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_reports_target_user_id ON public.moderation_reports USING btree (target_user_id);


--
-- Name: idx_mp_active_non_adult_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_active_non_adult_category ON public.marketplace_products USING btree (canonical_category_slug, updated_at DESC) WHERE ((status = 'active'::text) AND (is_adult = false));


--
-- Name: idx_mp_adult; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_adult ON public.marketplace_products USING btree (created_at DESC) WHERE (is_adult = true);


--
-- Name: idx_mp_canonical_category_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_canonical_category_slug ON public.marketplace_products USING btree (canonical_category_slug) WHERE ((status = 'active'::text) AND (is_adult = false));


--
-- Name: idx_mp_non_adult; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_non_adult ON public.marketplace_products USING btree (id) WHERE (is_adult = false);


--
-- Name: idx_mp_supplier_cost; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_supplier_cost ON public.marketplace_products USING btree (supplier_cost_cents) WHERE (supplier_cost_cents IS NOT NULL);


--
-- Name: idx_mp_supplier_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_supplier_product ON public.marketplace_products USING btree (supplier, supplier_product_id) WHERE (supplier_product_id IS NOT NULL);


--
-- Name: idx_mp_taxonomy_slug_active_non_adult; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_taxonomy_slug_active_non_adult ON public.marketplace_products USING btree (taxonomy_slug, updated_at DESC) WHERE ((status = 'active'::text) AND (is_adult = false));


--
-- Name: idx_mp_taxonomy_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_taxonomy_unresolved ON public.marketplace_products USING btree (taxonomy_unresolved) WHERE (taxonomy_unresolved = true);


--
-- Name: idx_mpv_ae_sku_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mpv_ae_sku_id ON public.marketplace_product_variants USING btree (((metadata ->> 'ae_sku_id'::text))) WHERE (metadata ? 'ae_sku_id'::text);


--
-- Name: idx_mpv_product_status_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mpv_product_status_stock ON public.marketplace_product_variants USING btree (product_id, status, inventory_quantity DESC);


--
-- Name: idx_notifications_actor_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_actor_user_id ON public.notifications USING btree (actor_user_id);


--
-- Name: idx_notifications_comment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_comment_id ON public.notifications USING btree (comment_id);


--
-- Name: idx_notifications_user_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_recent ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);


--
-- Name: idx_notifications_video_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_video_id ON public.notifications USING btree (video_id);


--
-- Name: idx_oauth_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_user ON public.oauth_accounts USING btree (user_id);


--
-- Name: idx_password_reset_tokens_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_hash ON public.password_reset_tokens USING btree (token_hash) WHERE (used_at IS NULL);


--
-- Name: idx_password_reset_tokens_user_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_user_expires ON public.password_reset_tokens USING btree (user_id, expires_at);


--
-- Name: idx_payment_transactions_checkout_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_transactions_checkout_session_id ON public.payment_transactions USING btree (checkout_session_id);


--
-- Name: idx_post_items_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_items_post ON public.community_post_items USING btree (post_id, "position");


--
-- Name: idx_post_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_items_product ON public.community_post_items USING btree (product_id) WHERE (product_id IS NOT NULL);


--
-- Name: idx_post_replies_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_replies_parent ON public.community_post_replies USING btree (parent_post_id, upvotes DESC);


--
-- Name: idx_post_votes_post_option; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_votes_post_option ON public.community_post_votes USING btree (post_id, option_key);


--
-- Name: idx_posts_author_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_author_recent ON public.community_posts USING btree (author_user_id, created_at DESC);


--
-- Name: idx_posts_ends; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_ends ON public.community_posts USING btree (ends_at) WHERE ((ends_at IS NOT NULL) AND (status = 'active'::text));


--
-- Name: idx_posts_format_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_format_active ON public.community_posts USING btree (format, hot_score DESC) WHERE (status = 'active'::text);


--
-- Name: idx_posts_mission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_mission ON public.community_posts USING btree (mission_id) WHERE (mission_id IS NOT NULL);


--
-- Name: idx_processed_stripe_events_processed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_processed_stripe_events_processed_at ON public.processed_stripe_events USING btree (processed_at);


--
-- Name: idx_prod_cat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_cat ON public.ae_products USING btree (category_id);


--
-- Name: idx_prod_cat_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_cat_search ON public.ae_products USING btree (category_id);


--
-- Name: idx_prod_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_created ON public.ae_products USING btree (created_at DESC);


--
-- Name: idx_prod_orders; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_orders ON public.ae_products USING btree (orders_count DESC NULLS LAST);


--
-- Name: idx_prod_price; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_price ON public.ae_products USING btree (price_ron);


--
-- Name: idx_prod_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_type ON public.ae_products USING btree (product_type);


--
-- Name: idx_prod_type_ro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_type_ro ON public.ae_products USING btree (product_type_ro);


--
-- Name: idx_prod_untranslated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_untranslated ON public.ae_products USING btree (id) WHERE (title_translations IS NULL);


--
-- Name: idx_prod_video; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_video ON public.ae_products USING btree (has_video) WHERE (has_video = true);


--
-- Name: idx_product_safety_labels_label; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_safety_labels_label ON public.product_safety_labels USING btree (label);


--
-- Name: idx_product_safety_labels_reviewed_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_safety_labels_reviewed_by_user_id ON public.product_safety_labels USING btree (reviewed_by_user_id);


--
-- Name: idx_product_safety_labels_unreviewed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_safety_labels_unreviewed ON public.product_safety_labels USING btree (label, classified_at) WHERE ((reviewed_by_human = false) AND (label = ANY (ARRAY['sensitive'::text, 'adult'::text])));


--
-- Name: idx_products_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_embedding ON public.marketplace_products USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_referral_attr_referrer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_attr_referrer ON public.referral_attributions USING btree (referrer_user_id, created_at DESC);


--
-- Name: idx_referral_attr_unvalidated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_attr_unvalidated ON public.referral_attributions USING btree (referrer_user_id) WHERE (validated_at IS NULL);


--
-- Name: idx_referral_attributions_reward_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_attributions_reward_event_id ON public.referral_attributions USING btree (reward_event_id);


--
-- Name: idx_referral_codes_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_codes_code ON public.referral_codes USING btree (code);


--
-- Name: idx_reviews_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_product ON public.product_reviews USING btree (product_id, is_hidden, created_at DESC);


--
-- Name: idx_reviews_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_user ON public.product_reviews USING btree (user_id);


--
-- Name: idx_reward_events_rule_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reward_events_rule_id ON public.reward_events USING btree (rule_id);


--
-- Name: idx_reward_events_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reward_events_transaction_id ON public.reward_events USING btree (transaction_id);


--
-- Name: idx_saved_products_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_products_product_id ON public.saved_products USING btree (product_id);


--
-- Name: idx_seller_sessions_seller_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seller_sessions_seller_id ON public.seller_sessions USING btree (seller_id);


--
-- Name: idx_submissions_leaderboard; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_leaderboard ON public.creator_mission_submissions USING btree (mission_id, sales DESC, ai_score DESC NULLS LAST);


--
-- Name: idx_submissions_mission_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_mission_status ON public.creator_mission_submissions USING btree (mission_id, status);


--
-- Name: idx_submissions_user_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_user_recent ON public.creator_mission_submissions USING btree (user_id, submitted_at DESC);


--
-- Name: idx_topics_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topics_parent_id ON public.topics USING btree (parent_id);


--
-- Name: idx_trending_detected; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trending_detected ON public.trending_now USING btree (detected_at DESC);


--
-- Name: idx_user_addresses_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_addresses_one_default ON public.user_addresses USING btree (user_id) WHERE (is_default = true);


--
-- Name: idx_user_addresses_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_addresses_user ON public.user_addresses USING btree (user_id);


--
-- Name: idx_user_daily_missions_template_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_daily_missions_template_id ON public.user_daily_missions USING btree (template_id);


--
-- Name: idx_user_feed_state_last_seen_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_feed_state_last_seen_item_id ON public.user_feed_state USING btree (last_seen_item_id);


--
-- Name: idx_user_hidden_videos_video_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_hidden_videos_video_id ON public.user_hidden_videos USING btree (video_id);


--
-- Name: idx_user_missions_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_missions_day ON public.user_daily_missions USING btree (user_id, day DESC);


--
-- Name: idx_user_missions_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_missions_open ON public.user_daily_missions USING btree (user_id, day) WHERE (claimed_at IS NULL);


--
-- Name: idx_user_strikes_revoked_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_strikes_revoked_by ON public.user_strikes USING btree (revoked_by);


--
-- Name: idx_users_age_verified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_age_verified ON public.users USING btree (id) WHERE (age_verification_status = 'approved'::text);


--
-- Name: idx_users_onboarding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_onboarding ON public.users USING btree (id) WHERE (onboarding_completed_at IS NULL);


--
-- Name: idx_users_stripe_connect; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_stripe_connect ON public.users USING btree (stripe_connect_account_id) WHERE (stripe_connect_account_id IS NOT NULL);


--
-- Name: idx_users_suspended; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_suspended ON public.users USING btree (suspended_until) WHERE (suspended_until IS NOT NULL);


--
-- Name: idx_var_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_var_product ON public.ae_variants USING btree (product_id);


--
-- Name: idx_video_captions_video; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_captions_video ON public.video_captions USING btree (video_id);


--
-- Name: idx_video_captions_video_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_captions_video_id ON public.video_captions USING btree (video_id);


--
-- Name: idx_video_product_links_creator_product_link_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_product_links_creator_product_link_id ON public.video_product_links USING btree (creator_product_link_id);


--
-- Name: idx_video_product_votes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_product_votes_user_id ON public.video_product_votes USING btree (user_id);


--
-- Name: idx_video_safety_labels_label; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_safety_labels_label ON public.video_safety_labels USING btree (label);


--
-- Name: idx_video_safety_labels_reviewed_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_safety_labels_reviewed_by_user_id ON public.video_safety_labels USING btree (reviewed_by_user_id);


--
-- Name: idx_video_safety_labels_unreviewed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_safety_labels_unreviewed ON public.video_safety_labels USING btree (classified_at) WHERE ((reviewed_by_human = false) AND (label = ANY (ARRAY['sensitive'::text, 'adult'::text])));


--
-- Name: idx_videos_adult; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_adult ON public.videos USING btree (created_at DESC) WHERE (is_adult = true);


--
-- Name: idx_videos_ai_hook_selected; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_ai_hook_selected ON public.videos USING btree (creator_id, ai_caption_used) WHERE (ai_hook_selected IS NOT NULL);


--
-- Name: idx_videos_audio_track_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_audio_track_id ON public.videos USING btree (audio_track_id) WHERE (audio_track_id IS NOT NULL);


--
-- Name: idx_videos_creator_draft; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_creator_draft ON public.videos USING btree (creator_id) WHERE (is_draft = true);


--
-- Name: idx_videos_creator_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_creator_profile_id ON public.videos USING btree (creator_profile_id);


--
-- Name: idx_videos_creator_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_creator_visibility ON public.videos USING btree (creator_id, visibility, created_at DESC);


--
-- Name: idx_videos_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_embedding ON public.videos USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_videos_non_adult; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_non_adult ON public.videos USING btree (id) WHERE (is_adult = false);


--
-- Name: idx_videos_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_scheduled ON public.videos USING btree (scheduled_publish_at) WHERE (scheduled_publish_at IS NOT NULL);


--
-- Name: idx_videos_scheduled_publish; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_scheduled_publish ON public.videos USING btree (scheduled_publish_at) WHERE ((visibility = 'scheduled'::text) AND (scheduled_publish_at IS NOT NULL));


--
-- Name: idx_videos_visible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_visible ON public.videos USING btree (status, is_hidden) WHERE ((status = 'ready'::text) AND (is_hidden = false));


--
-- Name: idx_wallets_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallets_level ON public.user_wallets USING btree (level DESC, xp DESC);


--
-- Name: idx_wallets_streak; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallets_streak ON public.user_wallets USING btree (streak_current DESC) WHERE (streak_current > 0);


--
-- Name: likes_comment_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX likes_comment_created_at_idx ON public.likes USING btree (comment_id, created_at DESC) WHERE (comment_id IS NOT NULL);


--
-- Name: likes_user_comment_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX likes_user_comment_uidx ON public.likes USING btree (user_id, comment_id) WHERE (comment_id IS NOT NULL);


--
-- Name: likes_user_video_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX likes_user_video_uidx ON public.likes USING btree (user_id, video_id) WHERE (video_id IS NOT NULL);


--
-- Name: likes_video_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX likes_video_created_at_idx ON public.likes USING btree (video_id, created_at DESC) WHERE (video_id IS NOT NULL);


--
-- Name: live_polls_stream_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_polls_stream_id_idx ON public.live_polls USING btree (stream_id);


--
-- Name: marketplace_merchants_external_ref_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marketplace_merchants_external_ref_uidx ON public.marketplace_merchants USING btree (external_ref) WHERE (external_ref IS NOT NULL);


--
-- Name: marketplace_merchants_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_merchants_owner_idx ON public.marketplace_merchants USING btree (owner_user_id, created_at DESC) WHERE (owner_user_id IS NOT NULL);


--
-- Name: marketplace_product_offers_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_product_offers_merchant_idx ON public.marketplace_product_offers USING btree (merchant_id, status) WHERE (merchant_id IS NOT NULL);


--
-- Name: marketplace_product_offers_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_product_offers_product_idx ON public.marketplace_product_offers USING btree (product_id, status, created_at DESC);


--
-- Name: marketplace_product_variants_ae_required_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marketplace_product_variants_ae_required_uidx ON public.marketplace_product_variants USING btree (product_id, ((metadata ->> 'ae_sku_id'::text))) WHERE (metadata ? 'ae_sku_id'::text);


--
-- Name: marketplace_product_variants_external_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marketplace_product_variants_external_uidx ON public.marketplace_product_variants USING btree (product_id, external_variant_id) WHERE (external_variant_id IS NOT NULL);


--
-- Name: marketplace_product_variants_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_product_variants_product_idx ON public.marketplace_product_variants USING btree (product_id, status);


--
-- Name: marketplace_products_merchant_external_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marketplace_products_merchant_external_uidx ON public.marketplace_products USING btree (merchant_id, external_product_id) WHERE ((merchant_id IS NOT NULL) AND (external_product_id IS NOT NULL));


--
-- Name: marketplace_products_search_document_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_products_search_document_gin_idx ON public.marketplace_products USING gin (search_document);


--
-- Name: marketplace_products_seller_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_products_seller_idx ON public.marketplace_products USING btree (seller_id, status, created_at DESC) WHERE (seller_id IS NOT NULL);


--
-- Name: marketplace_products_slug_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marketplace_products_slug_uidx ON public.marketplace_products USING btree (slug) WHERE (slug IS NOT NULL);


--
-- Name: marketplace_products_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_products_status_idx ON public.marketplace_products USING btree (status, updated_at DESC);


--
-- Name: marketplace_products_supplier_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marketplace_products_supplier_uidx ON public.marketplace_products USING btree (source_type, supplier, supplier_product_id) WHERE (supplier_product_id IS NOT NULL);


--
-- Name: marketplace_products_taxonomy_node_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_products_taxonomy_node_idx ON public.marketplace_products USING btree (taxonomy_node_slug) WHERE (taxonomy_node_slug IS NOT NULL);


--
-- Name: marketplace_products_title_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_products_title_trgm_idx ON public.marketplace_products USING gin (title public.gin_trgm_ops);


--
-- Name: media_assets_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_owner_idx ON public.media_assets USING btree (owner_type, owner_id, created_at DESC);


--
-- Name: media_assets_type_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_type_status_idx ON public.media_assets USING btree (type, status, created_at DESC);


--
-- Name: messages_conv_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_conv_created_idx ON public.messages USING btree (conversation_id, created_at DESC);


--
-- Name: moderation_actions_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX moderation_actions_case_idx ON public.moderation_actions USING btree (case_id, created_at DESC) WHERE (case_id IS NOT NULL);


--
-- Name: moderation_actions_target_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX moderation_actions_target_user_idx ON public.moderation_actions USING btree (target_user_id, created_at DESC) WHERE (target_user_id IS NOT NULL);


--
-- Name: moderation_cases_assigned_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX moderation_cases_assigned_idx ON public.moderation_cases USING btree (assigned_user_id, status, created_at DESC) WHERE (assigned_user_id IS NOT NULL);


--
-- Name: moderation_cases_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX moderation_cases_status_idx ON public.moderation_cases USING btree (status, severity, created_at DESC);


--
-- Name: moderation_reports_reporter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX moderation_reports_reporter_idx ON public.moderation_reports USING btree (reporter_user_id, created_at DESC) WHERE (reporter_user_id IS NOT NULL);


--
-- Name: moderation_reports_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX moderation_reports_status_idx ON public.moderation_reports USING btree (status, created_at DESC);


--
-- Name: moderation_reports_target_video_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX moderation_reports_target_video_idx ON public.moderation_reports USING btree (target_video_id, created_at DESC) WHERE (target_video_id IS NOT NULL);


--
-- Name: notifications_type_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_type_created_at_idx ON public.notifications USING btree (notification_type, created_at DESC);


--
-- Name: notifications_user_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_created_at_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: notifications_user_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_unread_idx ON public.notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);


--
-- Name: payment_customers_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_customers_user_idx ON public.payment_customers USING btree (user_id, provider);


--
-- Name: payment_transactions_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_transactions_order_idx ON public.payment_transactions USING btree (order_id, created_at DESC) WHERE (order_id IS NOT NULL);


--
-- Name: payment_transactions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_transactions_user_idx ON public.payment_transactions USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);


--
-- Name: product_reviews_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_reviews_order_id_idx ON public.product_reviews USING btree (order_id);


--
-- Name: product_topics_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_topics_product_idx ON public.product_topics USING btree (product_id);


--
-- Name: product_topics_topic_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_topics_topic_idx ON public.product_topics USING btree (topic_id);


--
-- Name: push_subscriptions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions USING btree (user_id);


--
-- Name: redis_stream_checkpoints_lag_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX redis_stream_checkpoints_lag_idx ON public.redis_stream_checkpoints USING btree (lag_count DESC, updated_at DESC);


--
-- Name: review_helpful_votes_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX review_helpful_votes_user_id_idx ON public.review_helpful_votes USING btree (user_id);


--
-- Name: reward_events_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reward_events_action_idx ON public.reward_events USING btree (action, created_at DESC);


--
-- Name: reward_events_user_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reward_events_user_recent_idx ON public.reward_events USING btree (user_id, created_at DESC);


--
-- Name: saved_products_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_products_user_created_idx ON public.saved_products USING btree (user_id, created_at DESC);


--
-- Name: saves_user_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saves_user_created_at_idx ON public.saves USING btree (user_id, created_at DESC);


--
-- Name: saves_video_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saves_video_created_at_idx ON public.saves USING btree (video_id, created_at DESC);


--
-- Name: seller_sessions_token_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_sessions_token_expires_idx ON public.seller_sessions USING btree (token, expires_at);


--
-- Name: sellers_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sellers_status_created_at_idx ON public.sellers USING btree (status, created_at DESC);


--
-- Name: service_api_keys_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_api_keys_owner_idx ON public.service_api_keys USING btree (owner_user_id, created_at DESC) WHERE (owner_user_id IS NOT NULL);


--
-- Name: service_api_keys_scopes_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_api_keys_scopes_gin_idx ON public.service_api_keys USING gin (scopes);


--
-- Name: shares_share_token_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX shares_share_token_uidx ON public.shares USING btree (share_token) WHERE (share_token IS NOT NULL);


--
-- Name: shares_user_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shares_user_created_at_idx ON public.shares USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);


--
-- Name: shares_video_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shares_video_created_at_idx ON public.shares USING btree (video_id, created_at DESC);


--
-- Name: supplier_order_items_commerce_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_order_items_commerce_item_idx ON public.supplier_order_items USING btree (commerce_order_item_id) WHERE (commerce_order_item_id IS NOT NULL);


--
-- Name: supplier_order_items_supplier_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_order_items_supplier_order_idx ON public.supplier_order_items USING btree (supplier_order_id, created_at);


--
-- Name: supplier_orders_order_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_orders_order_status_idx ON public.supplier_orders USING btree (commerce_order_id, status, created_at DESC);


--
-- Name: supplier_orders_supplier_external_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX supplier_orders_supplier_external_uidx ON public.supplier_orders USING btree (supplier, supplier_order_id) WHERE (supplier_order_id IS NOT NULL);


--
-- Name: supplier_webhook_events_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_webhook_events_supplier_idx ON public.supplier_webhook_events USING btree (supplier_id, created_at DESC);


--
-- Name: supplier_webhook_events_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX supplier_webhook_events_uidx ON public.supplier_webhook_events USING btree (supplier_id, external_order_id, tracking_number);


--
-- Name: taxonomy_nodes_ae_leaf_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taxonomy_nodes_ae_leaf_gin ON public.taxonomy_nodes USING gin (ae_leaf_ids);


--
-- Name: taxonomy_nodes_ae_root_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taxonomy_nodes_ae_root_gin ON public.taxonomy_nodes USING gin (ae_root_ids);


--
-- Name: taxonomy_nodes_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taxonomy_nodes_kind_idx ON public.taxonomy_nodes USING btree (kind);


--
-- Name: taxonomy_nodes_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taxonomy_nodes_parent_idx ON public.taxonomy_nodes USING btree (parent_slug);


--
-- Name: taxonomy_translations_locale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taxonomy_translations_locale_idx ON public.taxonomy_translations USING btree (locale);


--
-- Name: tracking_events_shipment_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tracking_events_shipment_occurred_idx ON public.tracking_events USING btree (shipment_id, occurred_at DESC);


--
-- Name: uq_post_items_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_post_items_dedup ON public.community_post_items USING btree (post_id, option_key, COALESCE((product_id)::text, external_url));


--
-- Name: user_collection_items_collection_pos_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_collection_items_collection_pos_idx ON public.user_collection_items USING btree (collection_id, "position" DESC, created_at DESC);


--
-- Name: user_collection_items_video_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_collection_items_video_idx ON public.user_collection_items USING btree (video_id);


--
-- Name: user_collections_user_slug_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_collections_user_slug_uidx ON public.user_collections USING btree (user_id, slug) WHERE (slug IS NOT NULL);


--
-- Name: user_collections_user_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_collections_user_sort_idx ON public.user_collections USING btree (user_id, created_at DESC);


--
-- Name: user_feed_state_refreshed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_feed_state_refreshed_idx ON public.user_feed_state USING btree (last_refreshed_at DESC);


--
-- Name: user_hidden_videos_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_hidden_videos_user_idx ON public.user_hidden_videos USING btree (user_id, hidden_at DESC);


--
-- Name: user_interests_user_weight_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_interests_user_weight_idx ON public.user_interests USING btree (user_id, weight DESC);


--
-- Name: user_risk_scores_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_risk_scores_score_idx ON public.user_risk_scores USING btree (score DESC) WHERE (score > (0)::numeric);


--
-- Name: user_sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_sessions_expires_at_idx ON public.user_sessions USING btree (expires_at);


--
-- Name: user_sessions_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_sessions_user_active_idx ON public.user_sessions USING btree (user_id, expires_at DESC) WHERE (revoked_at IS NULL);


--
-- Name: user_strikes_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_strikes_active_idx ON public.user_strikes USING btree (user_id) WHERE (status = 'active'::text);


--
-- Name: user_strikes_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_strikes_expires_idx ON public.user_strikes USING btree (expires_at) WHERE ((status = 'active'::text) AND (expires_at IS NOT NULL));


--
-- Name: user_strikes_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_strikes_ref_idx ON public.user_strikes USING btree (ref_type, ref_id) WHERE (ref_type IS NOT NULL);


--
-- Name: user_strikes_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_strikes_user_idx ON public.user_strikes USING btree (user_id, created_at DESC);


--
-- Name: user_watch_events_type_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_watch_events_type_recent_idx ON public.user_watch_events USING btree (event_type, created_at DESC);


--
-- Name: user_watch_events_user_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_watch_events_user_recent_idx ON public.user_watch_events USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);


--
-- Name: user_watch_events_video_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_watch_events_video_type_idx ON public.user_watch_events USING btree (video_id, event_type, created_at DESC);


--
-- Name: users_display_name_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_display_name_trgm_idx ON public.users USING gin (display_name public.gin_trgm_ops);


--
-- Name: users_email_lower_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_lower_uidx ON public.users USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: users_external_auth_id_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_external_auth_id_uidx ON public.users USING btree (external_auth_id) WHERE (external_auth_id IS NOT NULL);


--
-- Name: users_last_digest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_last_digest_idx ON public.users USING btree (last_digest_sent_at);


--
-- Name: users_phone_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_phone_uidx ON public.users USING btree (phone) WHERE (phone IS NOT NULL);


--
-- Name: users_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_status_created_at_idx ON public.users USING btree (status, created_at DESC);


--
-- Name: users_suspend_grace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_suspend_grace_idx ON public.users USING btree (suspend_grace_until) WHERE ((suspend_grace_until IS NOT NULL) AND (email_verified_at IS NULL));


--
-- Name: users_username_lower_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_username_lower_uidx ON public.users USING btree (lower(username));


--
-- Name: users_username_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_username_trgm_idx ON public.users USING gin (username public.gin_trgm_ops);


--
-- Name: users_verified_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_verified_idx ON public.users USING btree (id) WHERE (is_verified = true);


--
-- Name: video_assets_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_assets_status_idx ON public.video_assets USING btree (status, updated_at DESC);


--
-- Name: video_assets_video_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_assets_video_type_idx ON public.video_assets USING btree (video_id, asset_type, created_at DESC);


--
-- Name: video_processing_jobs_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_processing_jobs_asset_idx ON public.video_processing_jobs USING btree (asset_id) WHERE (asset_id IS NOT NULL);


--
-- Name: video_processing_jobs_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_processing_jobs_queue_idx ON public.video_processing_jobs USING btree (status, priority, scheduled_at) WHERE (status = ANY (ARRAY['queued'::text, 'failed'::text]));


--
-- Name: video_processing_jobs_source_url_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_processing_jobs_source_url_idx ON public.video_processing_jobs USING btree (source_url) WHERE (source_url IS NOT NULL);


--
-- Name: video_processing_jobs_video_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_processing_jobs_video_idx ON public.video_processing_jobs USING btree (video_id, created_at DESC);


--
-- Name: video_product_links_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_product_links_product_idx ON public.video_product_links USING btree (product_id, created_at DESC);


--
-- Name: video_product_links_video_product_placement_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX video_product_links_video_product_placement_uidx ON public.video_product_links USING btree (video_id, product_id, placement, sort_order);


--
-- Name: video_product_links_video_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_product_links_video_sort_idx ON public.video_product_links USING btree (video_id, sort_order, created_at DESC);


--
-- Name: video_product_votes_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_product_votes_product_idx ON public.video_product_votes USING btree (product_id, updated_at DESC);


--
-- Name: video_product_votes_session_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX video_product_votes_session_uidx ON public.video_product_votes USING btree (video_id, product_id, session_id) WHERE ((user_id IS NULL) AND (session_id IS NOT NULL));


--
-- Name: video_product_votes_user_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX video_product_votes_user_uidx ON public.video_product_votes USING btree (video_id, product_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: video_product_votes_video_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_product_votes_video_product_idx ON public.video_product_votes USING btree (video_id, product_id, updated_at DESC);


--
-- Name: video_rank_14d_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX video_rank_14d_pk ON public.video_rank_14d USING btree (video_id);


--
-- Name: video_rank_14d_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_rank_14d_score_idx ON public.video_rank_14d USING btree (rank_score DESC);


--
-- Name: video_upload_sessions_source_url_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_upload_sessions_source_url_idx ON public.video_upload_sessions USING btree (source_url) WHERE (source_url IS NOT NULL);


--
-- Name: video_upload_sessions_status_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_upload_sessions_status_expires_idx ON public.video_upload_sessions USING btree (status, expires_at);


--
-- Name: video_upload_sessions_user_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_upload_sessions_user_created_at_idx ON public.video_upload_sessions USING btree (user_id, created_at DESC);


--
-- Name: video_upload_sessions_video_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_upload_sessions_video_idx ON public.video_upload_sessions USING btree (video_id) WHERE (video_id IS NOT NULL);


--
-- Name: videos_creator_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_creator_created_at_idx ON public.videos USING btree (creator_id, created_at DESC);


--
-- Name: videos_product_refs_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_product_refs_gin_idx ON public.videos USING gin (product_refs jsonb_path_ops);


--
-- Name: videos_public_feed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_public_feed_idx ON public.videos USING btree (published_at DESC, id) WHERE ((visibility = 'public'::text) AND (status = 'ready'::text));


--
-- Name: videos_search_document_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_search_document_gin_idx ON public.videos USING gin (search_document);


--
-- Name: videos_slug_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX videos_slug_uidx ON public.videos USING btree (slug) WHERE (slug IS NOT NULL);


--
-- Name: videos_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_status_idx ON public.videos USING btree (status, updated_at DESC);


--
-- Name: videos_tags_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_tags_gin_idx ON public.videos USING gin (tags);


--
-- Name: videos_title_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_title_trgm_idx ON public.videos USING gin (public.f_unaccent(lower(title)) public.gin_trgm_ops);


--
-- Name: wallet_transactions_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wallet_transactions_source_idx ON public.wallet_transactions USING btree (source_type, source_id) WHERE (source_id IS NOT NULL);


--
-- Name: wallet_transactions_wallet_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wallet_transactions_wallet_recent_idx ON public.wallet_transactions USING btree (wallet_id, created_at DESC);


--
-- Name: wallet_tx_metadata_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wallet_tx_metadata_order_id_idx ON public.wallet_transactions USING btree (((metadata ->> 'order_id'::text))) WHERE (metadata ? 'order_id'::text);


--
-- Name: product_safety_labels product_safety_labels_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_safety_labels_touch BEFORE UPDATE ON public.product_safety_labels FOR EACH ROW EXECUTE FUNCTION public.trg_product_safety_labels_touch();


--
-- Name: taxonomy_nodes taxonomy_nodes_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER taxonomy_nodes_touch BEFORE UPDATE ON public.taxonomy_nodes FOR EACH ROW EXECUTE FUNCTION public.tg_taxonomy_touch_updated_at();


--
-- Name: taxonomy_translations taxonomy_translations_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER taxonomy_translations_touch BEFORE UPDATE ON public.taxonomy_translations FOR EACH ROW EXECUTE FUNCTION public.tg_taxonomy_touch_updated_at();


--
-- Name: ae_import_jobs trg_ae_import_jobs_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ae_import_jobs_touch BEFORE UPDATE ON public.ae_import_jobs FOR EACH ROW EXECUTE FUNCTION public.tg_ae_import_jobs_touch();


--
-- Name: user_age_verifications trg_age_verif_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_age_verif_touch BEFORE UPDATE ON public.user_age_verifications FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();


--
-- Name: analytics_delivery_batches trg_analytics_delivery_batches_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_analytics_delivery_batches_set_updated_at BEFORE UPDATE ON public.analytics_delivery_batches FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: auth_accounts trg_auth_accounts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auth_accounts_set_updated_at BEFORE UPDATE ON public.auth_accounts FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: challenge_entries trg_challenge_entries_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_challenge_entries_set_updated_at BEFORE UPDATE ON public.challenge_entries FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: checkout_sessions trg_checkout_sessions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_checkout_sessions_set_updated_at BEFORE UPDATE ON public.checkout_sessions FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: comments trg_comments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_comments_set_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: commerce_order_items trg_commerce_order_items_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_commerce_order_items_set_updated_at BEFORE UPDATE ON public.commerce_order_items FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: commerce_orders trg_commerce_orders_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_commerce_orders_set_updated_at BEFORE UPDATE ON public.commerce_orders FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: commission_payouts trg_commission_payouts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_commission_payouts_set_updated_at BEFORE UPDATE ON public.commission_payouts FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: commissions trg_commissions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_commissions_set_updated_at BEFORE UPDATE ON public.commissions FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: community_post_votes trg_community_post_votes_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_community_post_votes_touch BEFORE UPDATE ON public.community_post_votes FOR EACH ROW EXECUTE FUNCTION public.trg_creator_missions_touch();


--
-- Name: community_posts trg_community_posts_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_community_posts_touch BEFORE UPDATE ON public.community_posts FOR EACH ROW EXECUTE FUNCTION public.trg_creator_missions_touch();


--
-- Name: connect_transfers trg_connect_transfers_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_connect_transfers_set_updated_at BEFORE UPDATE ON public.connect_transfers FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: creator_applications trg_creator_applications_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_creator_applications_set_updated_at BEFORE UPDATE ON public.creator_applications FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: creator_collection_items trg_creator_collection_items_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_creator_collection_items_set_updated_at BEFORE UPDATE ON public.creator_collection_items FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: creator_collections trg_creator_collections_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_creator_collections_set_updated_at BEFORE UPDATE ON public.creator_collections FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: creator_connect_accounts trg_creator_connect_accounts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_creator_connect_accounts_set_updated_at BEFORE UPDATE ON public.creator_connect_accounts FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: creator_mission_submissions trg_creator_mission_submissions_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_creator_mission_submissions_touch BEFORE UPDATE ON public.creator_mission_submissions FOR EACH ROW EXECUTE FUNCTION public.trg_creator_missions_touch();


--
-- Name: creator_missions trg_creator_missions_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_creator_missions_touch BEFORE UPDATE ON public.creator_missions FOR EACH ROW EXECUTE FUNCTION public.trg_creator_missions_touch();


--
-- Name: creator_product_links trg_creator_product_links_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_creator_product_links_set_updated_at BEFORE UPDATE ON public.creator_product_links FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: creator_profiles trg_creator_profiles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_creator_profiles_set_updated_at BEFORE UPDATE ON public.creator_profiles FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: daily_challenges trg_daily_challenges_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_daily_challenges_set_updated_at BEFORE UPDATE ON public.daily_challenges FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: event_outbox trg_event_outbox_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_event_outbox_set_updated_at BEFORE UPDATE ON public.event_outbox FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: feed_items trg_feed_items_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_feed_items_set_updated_at BEFORE UPDATE ON public.feed_items FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: marketplace_merchants trg_marketplace_merchants_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_marketplace_merchants_set_updated_at BEFORE UPDATE ON public.marketplace_merchants FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: marketplace_product_offers trg_marketplace_product_offers_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_marketplace_product_offers_set_updated_at BEFORE UPDATE ON public.marketplace_product_offers FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: marketplace_product_variants trg_marketplace_product_variants_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_marketplace_product_variants_set_updated_at BEFORE UPDATE ON public.marketplace_product_variants FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: marketplace_products trg_marketplace_products_auto_safety; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_marketplace_products_auto_safety AFTER INSERT ON public.marketplace_products FOR EACH ROW EXECUTE FUNCTION public.auto_create_safety_label();


--
-- Name: marketplace_products trg_marketplace_products_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_marketplace_products_set_updated_at BEFORE UPDATE ON public.marketplace_products FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: media_assets trg_media_assets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_media_assets_set_updated_at BEFORE UPDATE ON public.media_assets FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: moderation_actions trg_moderation_actions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_moderation_actions_set_updated_at BEFORE UPDATE ON public.moderation_actions FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: moderation_cases trg_moderation_cases_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_moderation_cases_set_updated_at BEFORE UPDATE ON public.moderation_cases FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: moderation_reports trg_moderation_reports_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_moderation_reports_set_updated_at BEFORE UPDATE ON public.moderation_reports FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: notifications trg_notifications_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notifications_set_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: payment_customers trg_payment_customers_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_customers_set_updated_at BEFORE UPDATE ON public.payment_customers FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: payment_transactions trg_payment_transactions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_transactions_set_updated_at BEFORE UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: redis_stream_checkpoints trg_redis_stream_checkpoints_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_redis_stream_checkpoints_set_updated_at BEFORE UPDATE ON public.redis_stream_checkpoints FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: referral_attributions trg_referral_attr_counters; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_referral_attr_counters AFTER INSERT OR UPDATE ON public.referral_attributions FOR EACH ROW EXECUTE FUNCTION public.fn_referral_attr_bump_counters();


--
-- Name: reward_events trg_reward_events_credit_wallet; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reward_events_credit_wallet AFTER INSERT ON public.reward_events FOR EACH ROW EXECUTE FUNCTION public.fn_reward_events_credit_wallet();


--
-- Name: service_api_keys trg_service_api_keys_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_service_api_keys_set_updated_at BEFORE UPDATE ON public.service_api_keys FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: swyp_wallets trg_swyp_wallets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_swyp_wallets_set_updated_at BEFORE UPDATE ON public.swyp_wallets FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: user_collections trg_user_collections_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_collections_set_updated_at BEFORE UPDATE ON public.user_collections FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: user_feed_state trg_user_feed_state_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_feed_state_set_updated_at BEFORE UPDATE ON public.user_feed_state FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: user_interests trg_user_interests_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_interests_set_updated_at BEFORE UPDATE ON public.user_interests FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: user_sessions trg_user_sessions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_sessions_set_updated_at BEFORE UPDATE ON public.user_sessions FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: user_streaks trg_user_streaks_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_streaks_set_updated_at BEFORE UPDATE ON public.user_streaks FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: user_strikes trg_user_strikes_apply; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_strikes_apply BEFORE INSERT ON public.user_strikes FOR EACH ROW EXECUTE FUNCTION public.apply_user_strike();


--
-- Name: users trg_users_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: video_assets trg_video_assets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_video_assets_set_updated_at BEFORE UPDATE ON public.video_assets FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: video_processing_jobs trg_video_processing_jobs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_video_processing_jobs_set_updated_at BEFORE UPDATE ON public.video_processing_jobs FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: video_product_links trg_video_product_links_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_video_product_links_set_updated_at BEFORE UPDATE ON public.video_product_links FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: video_product_votes trg_video_product_votes_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_video_product_votes_set_updated_at BEFORE UPDATE ON public.video_product_votes FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: video_safety_labels trg_video_safety_labels_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_video_safety_labels_touch BEFORE UPDATE ON public.video_safety_labels FOR EACH ROW EXECUTE FUNCTION public.video_safety_labels_touch();


--
-- Name: video_upload_sessions trg_video_upload_sessions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_video_upload_sessions_set_updated_at BEFORE UPDATE ON public.video_upload_sessions FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: videos trg_videos_auto_safety; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_videos_auto_safety AFTER INSERT ON public.videos FOR EACH ROW EXECUTE FUNCTION public.auto_create_video_safety_label();


--
-- Name: videos trg_videos_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_videos_set_updated_at BEFORE UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();


--
-- Name: anon_actions anon_actions_anon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anon_actions
    ADD CONSTRAINT anon_actions_anon_id_fkey FOREIGN KEY (anon_id) REFERENCES public.anon_sessions(anon_id) ON DELETE CASCADE;


--
-- Name: anon_actions anon_actions_attributed_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anon_actions
    ADD CONSTRAINT anon_actions_attributed_user_id_fkey FOREIGN KEY (attributed_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: anon_post_votes anon_post_votes_anon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anon_post_votes
    ADD CONSTRAINT anon_post_votes_anon_id_fkey FOREIGN KEY (anon_id) REFERENCES public.anon_sessions(anon_id) ON DELETE CASCADE;


--
-- Name: anon_post_votes anon_post_votes_attributed_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anon_post_votes
    ADD CONSTRAINT anon_post_votes_attributed_user_id_fkey FOREIGN KEY (attributed_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: anon_post_votes anon_post_votes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anon_post_votes
    ADD CONSTRAINT anon_post_votes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE;


--
-- Name: anon_sessions anon_sessions_became_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anon_sessions
    ADD CONSTRAINT anon_sessions_became_user_id_fkey FOREIGN KEY (became_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: auth_accounts auth_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_accounts
    ADD CONSTRAINT auth_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_cart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.carts(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_marketplace_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_marketplace_product_id_fkey FOREIGN KEY (marketplace_product_id) REFERENCES public.marketplace_products(id) ON DELETE SET NULL;


--
-- Name: cart_items cart_items_marketplace_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_marketplace_variant_id_fkey FOREIGN KEY (marketplace_variant_id) REFERENCES public.marketplace_product_variants(id) ON DELETE SET NULL;


--
-- Name: carts carts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: challenge_entries challenge_entries_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_entries
    ADD CONSTRAINT challenge_entries_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.daily_challenges(id) ON DELETE CASCADE;


--
-- Name: challenge_entries challenge_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_entries
    ADD CONSTRAINT challenge_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: challenge_entries challenge_entries_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_entries
    ADD CONSTRAINT challenge_entries_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: checkout_sessions checkout_sessions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkout_sessions
    ADD CONSTRAINT checkout_sessions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.commerce_orders(id) ON DELETE SET NULL;


--
-- Name: checkout_sessions checkout_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkout_sessions
    ADD CONSTRAINT checkout_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: comments comments_parent_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comments comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: comments comments_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: commerce_order_items commerce_order_items_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_order_items
    ADD CONSTRAINT commerce_order_items_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: commerce_order_items commerce_order_items_creator_product_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_order_items
    ADD CONSTRAINT commerce_order_items_creator_product_link_id_fkey FOREIGN KEY (creator_product_link_id) REFERENCES public.creator_product_links(id) ON DELETE SET NULL;


--
-- Name: commerce_order_items commerce_order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_order_items
    ADD CONSTRAINT commerce_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.commerce_orders(id) ON DELETE CASCADE;


--
-- Name: commerce_order_items commerce_order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_order_items
    ADD CONSTRAINT commerce_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketplace_products(id) ON DELETE SET NULL;


--
-- Name: commerce_order_items commerce_order_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_order_items
    ADD CONSTRAINT commerce_order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.marketplace_product_variants(id) ON DELETE SET NULL;


--
-- Name: commerce_order_items commerce_order_items_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_order_items
    ADD CONSTRAINT commerce_order_items_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: commerce_orders commerce_orders_buyer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_orders
    ADD CONSTRAINT commerce_orders_buyer_user_id_fkey FOREIGN KEY (buyer_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: commerce_orders commerce_orders_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_orders
    ADD CONSTRAINT commerce_orders_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.marketplace_merchants(id) ON DELETE SET NULL;


--
-- Name: commerce_orders commerce_orders_source_share_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commerce_orders
    ADD CONSTRAINT commerce_orders_source_share_id_fkey FOREIGN KEY (source_share_id) REFERENCES public.shares(id) ON DELETE SET NULL;


--
-- Name: commission_payout_items commission_payout_items_commission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_payout_items
    ADD CONSTRAINT commission_payout_items_commission_id_fkey FOREIGN KEY (commission_id) REFERENCES public.commissions(id) ON DELETE CASCADE;


--
-- Name: commission_payout_items commission_payout_items_payout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_payout_items
    ADD CONSTRAINT commission_payout_items_payout_id_fkey FOREIGN KEY (payout_id) REFERENCES public.commission_payouts(id) ON DELETE CASCADE;


--
-- Name: commission_payouts commission_payouts_connect_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_payouts
    ADD CONSTRAINT commission_payouts_connect_account_id_fkey FOREIGN KEY (connect_account_id) REFERENCES public.creator_connect_accounts(id) ON DELETE SET NULL;


--
-- Name: commission_payouts commission_payouts_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_payouts
    ADD CONSTRAINT commission_payouts_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: commissions commissions_buyer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_buyer_user_id_fkey FOREIGN KEY (buyer_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: commissions commissions_commerce_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_commerce_order_id_fkey FOREIGN KEY (commerce_order_id) REFERENCES public.commerce_orders(id) ON DELETE SET NULL;


--
-- Name: commissions commissions_commerce_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_commerce_order_item_id_fkey FOREIGN KEY (commerce_order_item_id) REFERENCES public.commerce_order_items(id) ON DELETE SET NULL;


--
-- Name: commissions commissions_connect_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_connect_account_id_fkey FOREIGN KEY (connect_account_id) REFERENCES public.creator_connect_accounts(id) ON DELETE SET NULL;


--
-- Name: commissions commissions_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: commissions commissions_payment_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_payment_transaction_id_fkey FOREIGN KEY (payment_transaction_id) REFERENCES public.payment_transactions(id) ON DELETE SET NULL;


--
-- Name: commissions commissions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketplace_products(id) ON DELETE SET NULL;


--
-- Name: commissions commissions_source_share_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_source_share_id_fkey FOREIGN KEY (source_share_id) REFERENCES public.shares(id) ON DELETE SET NULL;


--
-- Name: commissions commissions_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: community_post_items community_post_items_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_items
    ADD CONSTRAINT community_post_items_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE;


--
-- Name: community_post_items community_post_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_items
    ADD CONSTRAINT community_post_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketplace_products(id) ON DELETE SET NULL;


--
-- Name: community_post_replies community_post_replies_parent_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_replies
    ADD CONSTRAINT community_post_replies_parent_post_id_fkey FOREIGN KEY (parent_post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE;


--
-- Name: community_post_replies community_post_replies_reply_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_replies
    ADD CONSTRAINT community_post_replies_reply_post_id_fkey FOREIGN KEY (reply_post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE;


--
-- Name: community_post_votes community_post_votes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_votes
    ADD CONSTRAINT community_post_votes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE;


--
-- Name: community_post_votes community_post_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_votes
    ADD CONSTRAINT community_post_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: community_posts community_posts_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts
    ADD CONSTRAINT community_posts_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: community_posts community_posts_mission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts
    ADD CONSTRAINT community_posts_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.creator_missions(id) ON DELETE SET NULL;


--
-- Name: community_posts community_posts_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts
    ADD CONSTRAINT community_posts_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: connect_transfers connect_transfers_commission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connect_transfers
    ADD CONSTRAINT connect_transfers_commission_id_fkey FOREIGN KEY (commission_id) REFERENCES public.commissions(id) ON DELETE SET NULL;


--
-- Name: connect_transfers connect_transfers_connect_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connect_transfers
    ADD CONSTRAINT connect_transfers_connect_account_id_fkey FOREIGN KEY (connect_account_id) REFERENCES public.creator_connect_accounts(id) ON DELETE CASCADE;


--
-- Name: connect_transfers connect_transfers_payout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connect_transfers
    ADD CONSTRAINT connect_transfers_payout_id_fkey FOREIGN KEY (payout_id) REFERENCES public.commission_payouts(id) ON DELETE SET NULL;


--
-- Name: conversation_participants conversation_participants_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: creator_applications creator_applications_reviewer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_applications
    ADD CONSTRAINT creator_applications_reviewer_user_id_fkey FOREIGN KEY (reviewer_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: creator_applications creator_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_applications
    ADD CONSTRAINT creator_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_collection_items creator_collection_items_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_collection_items
    ADD CONSTRAINT creator_collection_items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.creator_collections(id) ON DELETE CASCADE;


--
-- Name: creator_collection_items creator_collection_items_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_collection_items
    ADD CONSTRAINT creator_collection_items_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: creator_collections creator_collections_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_collections
    ADD CONSTRAINT creator_collections_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_connect_accounts creator_connect_accounts_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_connect_accounts
    ADD CONSTRAINT creator_connect_accounts_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_connect_accounts creator_connect_accounts_creator_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_connect_accounts
    ADD CONSTRAINT creator_connect_accounts_creator_profile_id_fkey FOREIGN KEY (creator_profile_id) REFERENCES public.creator_profiles(id) ON DELETE SET NULL;


--
-- Name: creator_mission_submissions creator_mission_submissions_mission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_mission_submissions
    ADD CONSTRAINT creator_mission_submissions_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.creator_missions(id) ON DELETE CASCADE;


--
-- Name: creator_mission_submissions creator_mission_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_mission_submissions
    ADD CONSTRAINT creator_mission_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_mission_submissions creator_mission_submissions_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_mission_submissions
    ADD CONSTRAINT creator_mission_submissions_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: creator_missions creator_missions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_missions
    ADD CONSTRAINT creator_missions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketplace_products(id) ON DELETE SET NULL;


--
-- Name: creator_missions creator_missions_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_missions
    ADD CONSTRAINT creator_missions_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.sellers(id) ON DELETE SET NULL;


--
-- Name: creator_product_links creator_product_links_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_product_links
    ADD CONSTRAINT creator_product_links_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_product_links creator_product_links_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_product_links
    ADD CONSTRAINT creator_product_links_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.marketplace_product_offers(id) ON DELETE SET NULL;


--
-- Name: creator_product_links creator_product_links_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_product_links
    ADD CONSTRAINT creator_product_links_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketplace_products(id) ON DELETE CASCADE;


--
-- Name: creator_profiles creator_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_profiles
    ADD CONSTRAINT creator_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: customer_sessions customer_sessions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_sessions
    ADD CONSTRAINT customer_sessions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: email_unsubscribes email_unsubscribes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribes
    ADD CONSTRAINT email_unsubscribes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: event_outbox event_outbox_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_outbox
    ADD CONSTRAINT event_outbox_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: feed_events feed_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_events
    ADD CONSTRAINT feed_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: feed_events feed_events_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_events
    ADD CONSTRAINT feed_events_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: feed_events feed_events_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_events
    ADD CONSTRAINT feed_events_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: feed_items feed_items_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_items
    ADD CONSTRAINT feed_items_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: feed_items feed_items_source_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_items
    ADD CONSTRAINT feed_items_source_event_id_fkey FOREIGN KEY (source_event_id) REFERENCES public.event_outbox(id) ON DELETE SET NULL;


--
-- Name: feed_items feed_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_items
    ADD CONSTRAINT feed_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: feed_items feed_items_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_items
    ADD CONSTRAINT feed_items_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: follows follows_follower_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_user_id_fkey FOREIGN KEY (follower_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: follows follows_following_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_following_user_id_fkey FOREIGN KEY (following_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: fulfillment_shipments fulfillment_shipments_commerce_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfillment_shipments
    ADD CONSTRAINT fulfillment_shipments_commerce_order_id_fkey FOREIGN KEY (commerce_order_id) REFERENCES public.commerce_orders(id) ON DELETE CASCADE;


--
-- Name: fulfillment_shipments fulfillment_shipments_supplier_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfillment_shipments
    ADD CONSTRAINT fulfillment_shipments_supplier_order_id_fkey FOREIGN KEY (supplier_order_id) REFERENCES public.supplier_orders(id) ON DELETE SET NULL;


--
-- Name: likes likes_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: likes likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: likes likes_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: live_chat_messages live_chat_messages_stream_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_chat_messages
    ADD CONSTRAINT live_chat_messages_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.live_streams(id) ON DELETE CASCADE;


--
-- Name: live_polls live_polls_stream_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_polls
    ADD CONSTRAINT live_polls_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.live_streams(id) ON DELETE CASCADE;


--
-- Name: live_shop_items live_shop_items_stream_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_shop_items
    ADD CONSTRAINT live_shop_items_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.live_streams(id) ON DELETE CASCADE;


--
-- Name: marketplace_merchants marketplace_merchants_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_merchants
    ADD CONSTRAINT marketplace_merchants_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: marketplace_product_offers marketplace_product_offers_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_product_offers
    ADD CONSTRAINT marketplace_product_offers_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.marketplace_merchants(id) ON DELETE SET NULL;


--
-- Name: marketplace_product_offers marketplace_product_offers_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_product_offers
    ADD CONSTRAINT marketplace_product_offers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketplace_products(id) ON DELETE CASCADE;


--
-- Name: marketplace_product_variants marketplace_product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_product_variants
    ADD CONSTRAINT marketplace_product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketplace_products(id) ON DELETE CASCADE;


--
-- Name: marketplace_products marketplace_products_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_products
    ADD CONSTRAINT marketplace_products_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.marketplace_merchants(id) ON DELETE SET NULL;


--
-- Name: marketplace_products marketplace_products_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_products
    ADD CONSTRAINT marketplace_products_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.sellers(id) ON DELETE SET NULL;


--
-- Name: marketplace_products marketplace_products_taxonomy_node_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_products
    ADD CONSTRAINT marketplace_products_taxonomy_node_slug_fkey FOREIGN KEY (taxonomy_node_slug) REFERENCES public.taxonomy_nodes(slug) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: media_assets media_assets_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_reply_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: moderation_actions moderation_actions_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: moderation_actions moderation_actions_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.moderation_cases(id) ON DELETE SET NULL;


--
-- Name: moderation_actions moderation_actions_target_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_target_comment_id_fkey FOREIGN KEY (target_comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: moderation_actions moderation_actions_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: moderation_actions moderation_actions_target_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_target_video_id_fkey FOREIGN KEY (target_video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: moderation_cases moderation_cases_assigned_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_cases
    ADD CONSTRAINT moderation_cases_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: moderation_cases moderation_cases_opened_by_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_cases
    ADD CONSTRAINT moderation_cases_opened_by_report_id_fkey FOREIGN KEY (opened_by_report_id) REFERENCES public.moderation_reports(id) ON DELETE SET NULL;


--
-- Name: moderation_cases moderation_cases_resolved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_cases
    ADD CONSTRAINT moderation_cases_resolved_by_user_id_fkey FOREIGN KEY (resolved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: moderation_cases moderation_cases_target_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_cases
    ADD CONSTRAINT moderation_cases_target_comment_id_fkey FOREIGN KEY (target_comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: moderation_cases moderation_cases_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_cases
    ADD CONSTRAINT moderation_cases_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: moderation_cases moderation_cases_target_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_cases
    ADD CONSTRAINT moderation_cases_target_video_id_fkey FOREIGN KEY (target_video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: moderation_reports moderation_reports_reporter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_reports
    ADD CONSTRAINT moderation_reports_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: moderation_reports moderation_reports_target_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_reports
    ADD CONSTRAINT moderation_reports_target_comment_id_fkey FOREIGN KEY (target_comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: moderation_reports moderation_reports_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_reports
    ADD CONSTRAINT moderation_reports_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: moderation_reports moderation_reports_target_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_reports
    ADD CONSTRAINT moderation_reports_target_video_id_fkey FOREIGN KEY (target_video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: oauth_accounts oauth_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_accounts
    ADD CONSTRAINT oauth_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payment_customers payment_customers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_customers
    ADD CONSTRAINT payment_customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payment_transactions payment_transactions_checkout_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_checkout_session_id_fkey FOREIGN KEY (checkout_session_id) REFERENCES public.checkout_sessions(id) ON DELETE SET NULL;


--
-- Name: payment_transactions payment_transactions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.commerce_orders(id) ON DELETE SET NULL;


--
-- Name: payment_transactions payment_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: product_reviews product_reviews_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.commerce_orders(id) ON DELETE SET NULL;


--
-- Name: product_reviews product_reviews_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketplace_products(id) ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: product_safety_labels product_safety_labels_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_safety_labels
    ADD CONSTRAINT product_safety_labels_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketplace_products(id) ON DELETE CASCADE;


--
-- Name: product_safety_labels product_safety_labels_reviewed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_safety_labels
    ADD CONSTRAINT product_safety_labels_reviewed_by_user_id_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES public.users(id);


--
-- Name: product_topics product_topics_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_topics
    ADD CONSTRAINT product_topics_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: referral_attributions referral_attributions_invitee_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_attributions
    ADD CONSTRAINT referral_attributions_invitee_user_id_fkey FOREIGN KEY (invitee_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: referral_attributions referral_attributions_referrer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_attributions
    ADD CONSTRAINT referral_attributions_referrer_user_id_fkey FOREIGN KEY (referrer_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: referral_attributions referral_attributions_reward_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_attributions
    ADD CONSTRAINT referral_attributions_reward_event_id_fkey FOREIGN KEY (reward_event_id) REFERENCES public.reward_events(id) ON DELETE SET NULL;


--
-- Name: referral_codes referral_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: review_helpful_votes review_helpful_votes_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_helpful_votes
    ADD CONSTRAINT review_helpful_votes_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.product_reviews(id) ON DELETE CASCADE;


--
-- Name: review_helpful_votes review_helpful_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_helpful_votes
    ADD CONSTRAINT review_helpful_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reward_events reward_events_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_events
    ADD CONSTRAINT reward_events_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.reward_rules(id) ON DELETE SET NULL;


--
-- Name: reward_events reward_events_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_events
    ADD CONSTRAINT reward_events_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.wallet_transactions(id) ON DELETE SET NULL;


--
-- Name: reward_events reward_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_events
    ADD CONSTRAINT reward_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: saved_products saved_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_products
    ADD CONSTRAINT saved_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketplace_products(id) ON DELETE CASCADE;


--
-- Name: saved_products saved_products_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_products
    ADD CONSTRAINT saved_products_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: saves saves_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saves
    ADD CONSTRAINT saves_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: saves saves_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saves
    ADD CONSTRAINT saves_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: seller_sessions seller_sessions_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_sessions
    ADD CONSTRAINT seller_sessions_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.sellers(id) ON DELETE CASCADE;


--
-- Name: service_api_keys service_api_keys_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_api_keys
    ADD CONSTRAINT service_api_keys_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: shares shares_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shares
    ADD CONSTRAINT shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: shares shares_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shares
    ADD CONSTRAINT shares_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: supplier_order_items supplier_order_items_commerce_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_order_items
    ADD CONSTRAINT supplier_order_items_commerce_order_item_id_fkey FOREIGN KEY (commerce_order_item_id) REFERENCES public.commerce_order_items(id) ON DELETE SET NULL;


--
-- Name: supplier_order_items supplier_order_items_supplier_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_order_items
    ADD CONSTRAINT supplier_order_items_supplier_order_id_fkey FOREIGN KEY (supplier_order_id) REFERENCES public.supplier_orders(id) ON DELETE CASCADE;


--
-- Name: supplier_orders supplier_orders_commerce_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_orders
    ADD CONSTRAINT supplier_orders_commerce_order_id_fkey FOREIGN KEY (commerce_order_id) REFERENCES public.commerce_orders(id) ON DELETE CASCADE;


--
-- Name: swyp_wallets swyp_wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swyp_wallets
    ADD CONSTRAINT swyp_wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: taxonomy_nodes taxonomy_nodes_parent_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_nodes
    ADD CONSTRAINT taxonomy_nodes_parent_slug_fkey FOREIGN KEY (parent_slug) REFERENCES public.taxonomy_nodes(slug) ON DELETE RESTRICT;


--
-- Name: taxonomy_translations taxonomy_translations_node_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_translations
    ADD CONSTRAINT taxonomy_translations_node_slug_fkey FOREIGN KEY (node_slug) REFERENCES public.taxonomy_nodes(slug) ON DELETE CASCADE;


--
-- Name: topics topics_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.topics(id) ON DELETE SET NULL;


--
-- Name: tracking_events tracking_events_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracking_events
    ADD CONSTRAINT tracking_events_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.fulfillment_shipments(id) ON DELETE CASCADE;


--
-- Name: user_addresses user_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_age_verifications user_age_verifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_age_verifications
    ADD CONSTRAINT user_age_verifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_collection_items user_collection_items_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_collection_items
    ADD CONSTRAINT user_collection_items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.user_collections(id) ON DELETE CASCADE;


--
-- Name: user_collection_items user_collection_items_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_collection_items
    ADD CONSTRAINT user_collection_items_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: user_collections user_collections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_collections
    ADD CONSTRAINT user_collections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_daily_missions user_daily_missions_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_daily_missions
    ADD CONSTRAINT user_daily_missions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.daily_mission_templates(id) ON DELETE CASCADE;


--
-- Name: user_daily_missions user_daily_missions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_daily_missions
    ADD CONSTRAINT user_daily_missions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_feed_state user_feed_state_last_seen_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_feed_state
    ADD CONSTRAINT user_feed_state_last_seen_item_id_fkey FOREIGN KEY (last_seen_item_id) REFERENCES public.feed_items(id) ON DELETE SET NULL;


--
-- Name: user_feed_state user_feed_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_feed_state
    ADD CONSTRAINT user_feed_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_hidden_videos user_hidden_videos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hidden_videos
    ADD CONSTRAINT user_hidden_videos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_hidden_videos user_hidden_videos_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hidden_videos
    ADD CONSTRAINT user_hidden_videos_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: user_interests user_interests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_risk_scores user_risk_scores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_risk_scores
    ADD CONSTRAINT user_risk_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_streaks user_streaks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_streaks
    ADD CONSTRAINT user_streaks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_strikes user_strikes_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_strikes
    ADD CONSTRAINT user_strikes_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_strikes user_strikes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_strikes
    ADD CONSTRAINT user_strikes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_wallets user_wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_wallets
    ADD CONSTRAINT user_wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_watch_events user_watch_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_watch_events
    ADD CONSTRAINT user_watch_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_watch_events user_watch_events_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_watch_events
    ADD CONSTRAINT user_watch_events_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_assets video_assets_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_assets
    ADD CONSTRAINT video_assets_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_captions video_captions_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_captions
    ADD CONSTRAINT video_captions_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_milestones video_milestones_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_milestones
    ADD CONSTRAINT video_milestones_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_processing_jobs video_processing_jobs_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_processing_jobs
    ADD CONSTRAINT video_processing_jobs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.video_assets(id) ON DELETE SET NULL;


--
-- Name: video_processing_jobs video_processing_jobs_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_processing_jobs
    ADD CONSTRAINT video_processing_jobs_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_product_links video_product_links_creator_product_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_product_links
    ADD CONSTRAINT video_product_links_creator_product_link_id_fkey FOREIGN KEY (creator_product_link_id) REFERENCES public.creator_product_links(id) ON DELETE SET NULL;


--
-- Name: video_product_links video_product_links_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_product_links
    ADD CONSTRAINT video_product_links_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketplace_products(id) ON DELETE CASCADE;


--
-- Name: video_product_links video_product_links_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_product_links
    ADD CONSTRAINT video_product_links_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_product_votes video_product_votes_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_product_votes
    ADD CONSTRAINT video_product_votes_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.marketplace_products(id) ON DELETE CASCADE;


--
-- Name: video_product_votes video_product_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_product_votes
    ADD CONSTRAINT video_product_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: video_product_votes video_product_votes_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_product_votes
    ADD CONSTRAINT video_product_votes_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_safety_labels video_safety_labels_reviewed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_safety_labels
    ADD CONSTRAINT video_safety_labels_reviewed_by_user_id_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: video_safety_labels video_safety_labels_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_safety_labels
    ADD CONSTRAINT video_safety_labels_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_upload_sessions video_upload_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_upload_sessions
    ADD CONSTRAINT video_upload_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: video_upload_sessions video_upload_sessions_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_upload_sessions
    ADD CONSTRAINT video_upload_sessions_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: videos videos_audio_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_audio_track_id_fkey FOREIGN KEY (audio_track_id) REFERENCES public.audio_tracks(id) ON DELETE SET NULL;


--
-- Name: videos videos_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: videos videos_creator_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_creator_profile_id_fkey FOREIGN KEY (creator_profile_id) REFERENCES public.creator_profiles(id) ON DELETE SET NULL;


--
-- Name: wallet_ledger wallet_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: wallet_transactions wallet_transactions_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.swyp_wallets(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 4OyKrczoWmzfW3L249il4h2UnZwwwYeATwfuhpNWjwKBktqH4DFCzQWtjxztsEY

