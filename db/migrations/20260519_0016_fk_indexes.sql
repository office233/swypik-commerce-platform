-- Migration: 20260519_0016_fk_indexes.sql
-- Adds covering indexes on 13 foreign-key columns that lacked them.
-- Without these, DELETE on the referenced table forces a sequential scan on
-- the FK side and JOINs filtering by FK degrade as the tables grow.
-- All indexes are CREATE INDEX IF NOT EXISTS so the migration is idempotent.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_anon_actions_attributed_user_id
  ON public.anon_actions (attributed_user_id);

CREATE INDEX IF NOT EXISTS idx_anon_post_votes_attributed_user_id
  ON public.anon_post_votes (attributed_user_id);

CREATE INDEX IF NOT EXISTS idx_community_post_replies_reply_post_id
  ON public.community_post_replies (reply_post_id);

CREATE INDEX IF NOT EXISTS idx_community_posts_video_id
  ON public.community_posts (video_id);

CREATE INDEX IF NOT EXISTS idx_community_post_votes_user_id
  ON public.community_post_votes (user_id);

CREATE INDEX IF NOT EXISTS idx_creator_mission_submissions_video_id
  ON public.creator_mission_submissions (video_id);

CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer_id
  ON public.customer_sessions (customer_id);

CREATE INDEX IF NOT EXISTS idx_product_safety_labels_reviewed_by_user_id
  ON public.product_safety_labels (reviewed_by_user_id);

CREATE INDEX IF NOT EXISTS idx_referral_attributions_reward_event_id
  ON public.referral_attributions (reward_event_id);

CREATE INDEX IF NOT EXISTS idx_user_daily_missions_template_id
  ON public.user_daily_missions (template_id);

CREATE INDEX IF NOT EXISTS idx_user_strikes_revoked_by
  ON public.user_strikes (revoked_by);

CREATE INDEX IF NOT EXISTS idx_video_product_votes_user_id
  ON public.video_product_votes (user_id);

CREATE INDEX IF NOT EXISTS idx_video_safety_labels_reviewed_by_user_id
  ON public.video_safety_labels (reviewed_by_user_id);

COMMIT;
