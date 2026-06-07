"""Compute mining multiplier breakdown for a user.

UNLIMITED referral system (Pi-style growth):
  - L1 (direct):     +10% per active ref
  - L2 (ref of ref): +5%  per active ref
  - L3 (deep):       +2%  per active ref
  - NO CAP — invite 100 → +1000% boost on L1 alone.

Anti-abuse:
  - "Active" = tap in last 7 days (computed by nightly cron).
  - KYC face mandatory for ANY referral bonus to count.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app import db
from app.config import get_settings


@dataclass(frozen=True)
class MultiplierBreakdown:
    base: Decimal
    streak_pct: Decimal
    kyc_pct: Decimal
    pioneer_pct: Decimal
    circle_pct: Decimal
    refs_l1_pct: Decimal
    refs_l2_pct: Decimal
    refs_l3_pct: Decimal
    stake_pct: Decimal
    total_multiplier: Decimal

    def to_dict(self) -> dict[str, str]:
        return {k: str(v) for k, v in self.__dict__.items()}


async def compute_for_user(user_id: str) -> MultiplierBreakdown:
    s = get_settings()
    row = await db.fetchrow(
        """
        SELECT streak_current, refs_l1_active, refs_l2_active, refs_l3_active,
               kyc_face_verified, pioneer_badge, security_circle_count
          FROM swypik_mining_stats
         WHERE user_id = $1::uuid
        """,
        user_id,
    )
    if row is None:
        # Brand new user, base only.
        return MultiplierBreakdown(
            base=Decimal(str(s.base_reward_swyp)),
            streak_pct=Decimal(0),
            kyc_pct=Decimal(0),
            pioneer_pct=Decimal(0),
            circle_pct=Decimal(0),
            refs_l1_pct=Decimal(0),
            refs_l2_pct=Decimal(0),
            refs_l3_pct=Decimal(0),
            stake_pct=Decimal(0),
            total_multiplier=Decimal("1.0"),
        )

    kyc_ok = bool(row["kyc_face_verified"])

    streak_days = min(int(row["streak_current"]), s.streak_max_days)
    streak_pct = Decimal(streak_days) * Decimal(str(s.streak_bonus_per_day_pct))

    kyc_pct = Decimal(str(s.kyc_bonus_pct)) if kyc_ok else Decimal(0)
    pioneer_pct = Decimal(str(s.pioneer_bonus_pct)) if row["pioneer_badge"] else Decimal(0)

    circle_count = min(int(row["security_circle_count"]), 5)
    circle_pct = Decimal(circle_count) * Decimal(str(s.circle_member_bonus_pct))

    # Referrals ONLY count if KYC verified (anti-Sybil hard rule).
    if kyc_ok:
        refs_l1_pct = Decimal(int(row["refs_l1_active"])) * Decimal(str(s.ref_l1_bonus_pct))
        refs_l2_pct = Decimal(int(row["refs_l2_active"])) * Decimal(str(s.ref_l2_bonus_pct))
        refs_l3_pct = Decimal(int(row["refs_l3_active"])) * Decimal(str(s.ref_l3_bonus_pct))
    else:
        refs_l1_pct = refs_l2_pct = refs_l3_pct = Decimal(0)

    # Stake bonus (sum of active stakes)
    stake_bonus = await db.fetchval(
        """
        SELECT COALESCE(SUM(multiplier_bonus), 0)::numeric
          FROM swypik_stakes
         WHERE user_id = $1::uuid AND status = 'active'
        """,
        user_id,
    )
    stake_pct = Decimal(str(stake_bonus or 0)) * Decimal(100)

    total_pct = (
        streak_pct + kyc_pct + pioneer_pct + circle_pct
        + refs_l1_pct + refs_l2_pct + refs_l3_pct + stake_pct
    )
    total_multiplier = Decimal(1) + (total_pct / Decimal(100))

    return MultiplierBreakdown(
        base=Decimal(str(s.base_reward_swyp)),
        streak_pct=streak_pct,
        kyc_pct=kyc_pct,
        pioneer_pct=pioneer_pct,
        circle_pct=circle_pct,
        refs_l1_pct=refs_l1_pct,
        refs_l2_pct=refs_l2_pct,
        refs_l3_pct=refs_l3_pct,
        stake_pct=stake_pct,
        total_multiplier=total_multiplier,
    )
