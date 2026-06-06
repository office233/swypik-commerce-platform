"""Daily mining claim: tap → compute reward → mint $SWYP.

Flow:
  1. Client requests challenge (tappow).
  2. Client computes nonce, calls /mine/claim with proof.
  3. We verify the proof, check 24h window, compute multiplier,
     mint $SWYP from the mining_rewards_pool, update streak.
"""
from __future__ import annotations

import secrets
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import structlog

from app import db
from app.chain.tx_builder import apply_tx, compute_txid
from app.chain.wallet import get_or_create_user_address
from app.config import get_settings
from app.mining.multipliers import compute_for_user

log = structlog.get_logger(__name__)

MINING_POOL_ADDRESS = "swyp1miningrewardspool00000000000000000a0"


class ClaimError(Exception):
    """Raised when claim is rejected (rate-limited, already claimed, capped)."""

    def __init__(self, code: str, message: str, retry_at: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retry_at = retry_at


async def claim_daily(user_id: str, tappow_proof: str, device_hash: str, ip_hash: str) -> dict:
    """Process a daily mining claim. Atomic — uses Postgres advisory lock."""
    s = get_settings()
    address = await get_or_create_user_address(user_id)

    # Advisory lock per-user to prevent concurrent claims.
    lock_key = abs(hash(("swypik_claim", user_id))) % (2**31)

    async with db.get_pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock($1)", lock_key)

            stats = await conn.fetchrow(
                """
                SELECT last_tap_at, streak_current, daily_today, daily_cap
                  FROM swypik_mining_stats
                 WHERE user_id = $1::uuid
                 FOR UPDATE
                """,
                user_id,
            )
            if stats is None:
                await conn.execute(
                    "INSERT INTO swypik_mining_stats (user_id) VALUES ($1::uuid)",
                    user_id,
                )
                last_tap = None
                streak = 0
                daily_today = Decimal(0)
                daily_cap = Decimal(str(s.max_daily_reward))
            else:
                last_tap = stats["last_tap_at"]
                streak = int(stats["streak_current"])
                daily_today = Decimal(str(stats["daily_today"] or 0))
                daily_cap = Decimal(str(stats["daily_cap"] or s.max_daily_reward))

            now = datetime.now(timezone.utc)

            # 24h window check
            if last_tap is not None:
                elapsed = (now - last_tap).total_seconds() / 3600
                if elapsed < s.daily_claim_window_hours:
                    retry_at = (last_tap + timedelta(hours=s.daily_claim_window_hours)).isoformat()
                    raise ClaimError("already_claimed",
                                     f"Next claim in {s.daily_claim_window_hours - elapsed:.1f}h",
                                     retry_at)

                # Streak: continues if within 48h, otherwise resets.
                if elapsed <= s.streak_reset_hours:
                    new_streak = streak + 1
                else:
                    new_streak = 1
            else:
                new_streak = 1

            # Daily cap (per-UTC-day)
            today_midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
            if last_tap is None or last_tap < today_midnight:
                daily_today = Decimal(0)  # new day, reset counter

            # Compute reward
            mult = await compute_for_user(user_id)
            raw_reward = mult.base * mult.total_multiplier
            remaining_cap = daily_cap - daily_today
            if remaining_cap <= 0:
                raise ClaimError("daily_cap_reached", "Daily mining cap reached. Try tomorrow.")
            final_reward = min(raw_reward, remaining_cap).quantize(Decimal("0.000000001"))

            # Mint from mining pool
            txid = compute_txid(
                from_addr=MINING_POOL_ADDRESS,
                to_addr=address,
                amount=final_reward,
                fee=Decimal(0),
                tx_type="mining_reward",
                nonce=secrets.token_hex(8),
            )

            # Ensure mining pool has a balance row + topped up (genesis mint if needed)
            await _ensure_mining_pool_funded(conn, final_reward)

            await conn.fetchval(
                "SELECT swypik_apply_tx($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
                txid, None, MINING_POOL_ADDRESS, address,
                final_reward, Decimal(0), "mining_reward",
                f"Daily claim — streak {new_streak}d", "{}",
            )

            # Record mining session
            session_id = await conn.fetchval(
                """
                INSERT INTO swypik_mining_sessions
                  (user_id, address, session_type, base_reward, multiplier,
                   final_reward, tappow_proof, device_hash, ip_hash,
                   multiplier_breakdown, tx_id)
                VALUES ($1::uuid, $2, 'daily_tap', $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
                RETURNING id
                """,
                user_id, address, mult.base, mult.total_multiplier,
                final_reward, tappow_proof, device_hash, ip_hash,
                str(mult.to_dict()).replace("'", '"'),
                txid,
            )

            # Update stats
            await conn.execute(
                """
                UPDATE swypik_mining_stats
                   SET last_tap_at = $2,
                       streak_current = $3,
                       streak_best = GREATEST(streak_best, $3),
                       daily_today = $4,
                       total_mined = total_mined + $5,
                       current_multiplier = $6,
                       updated_at = now()
                 WHERE user_id = $1::uuid
                """,
                user_id, now, new_streak, daily_today + final_reward,
                final_reward, mult.total_multiplier,
            )

            # Passive referral rewards (L1/L2/L3 ancestors)
            await _distribute_passive_referral_rewards(conn, user_id, final_reward)

            log.info(
                "mining_claim_ok",
                user_id=user_id,
                address=address,
                reward=str(final_reward),
                streak=new_streak,
                multiplier=str(mult.total_multiplier),
            )

            return {
                "address": address,
                "reward": str(final_reward),
                "streak": new_streak,
                "multiplier": str(mult.total_multiplier),
                "txid": txid,
                "session_id": str(session_id),
                "next_claim_at": (now + timedelta(hours=s.daily_claim_window_hours)).isoformat(),
            }


async def _ensure_mining_pool_funded(conn, needed: Decimal) -> None:
    """Lazy-mint into the mining pool if it runs dry (bounded by 15.75M cap)."""
    bal = await conn.fetchval(
        "SELECT COALESCE(balance, 0) FROM swypik_token_balances WHERE address = $1",
        MINING_POOL_ADDRESS,
    )
    bal = Decimal(str(bal or 0))
    if bal >= needed:
        return

    pool_cap = Decimal("15750000")  # 75% of 21M
    total_minted = await conn.fetchval(
        """
        SELECT COALESCE(SUM(amount), 0) FROM swypik_token_txs
         WHERE to_address = $1 AND from_address IS NULL AND tx_type = 'mint'
        """,
        MINING_POOL_ADDRESS,
    )
    total_minted = Decimal(str(total_minted or 0))
    available = pool_cap - total_minted
    if available <= 0:
        raise ClaimError("supply_exhausted", "Mining pool depleted — chain at hard cap.")

    top_up = min(Decimal("100000"), available)  # mint in chunks of 100K
    txid = compute_txid(
        from_addr=None, to_addr=MINING_POOL_ADDRESS,
        amount=top_up, fee=Decimal(0), tx_type="mint",
        nonce=secrets.token_hex(8),
    )
    await conn.fetchval(
        "SELECT swypik_apply_tx($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
        txid, None, None, MINING_POOL_ADDRESS,
        top_up, Decimal(0), "mint", "Mining pool top-up", "{}",
    )


async def _distribute_passive_referral_rewards(conn, user_id: str, base_reward: Decimal) -> None:
    """Credits L1/L2/L3 ancestors with a % of the miner's reward.

    Anti-abuse: ancestor must have KYC verified AND be marked active.
    """
    s = get_settings()
    pcts = {
        1: Decimal(str(s.ref_passive_l1_pct)) / Decimal(100),
        2: Decimal(str(s.ref_passive_l2_pct)) / Decimal(100),
        3: Decimal(str(s.ref_passive_l3_pct)) / Decimal(100),
    }

    ancestors = await conn.fetch(
        """
        SELECT n.ancestor_id, n.level, ms.kyc_face_verified
          FROM swypik_referral_network n
          JOIN swypik_mining_stats ms ON ms.user_id = n.ancestor_id
         WHERE n.user_id = $1::uuid AND n.active = TRUE
        """,
        user_id,
    )

    for row in ancestors:
        if not row["kyc_face_verified"]:
            continue
        ancestor_id = str(row["ancestor_id"])
        level = int(row["level"])
        amount = (base_reward * pcts[level]).quantize(Decimal("0.000000001"))
        if amount <= 0:
            continue

        ancestor_addr = await conn.fetchval(
            """
            SELECT address FROM swypik_addresses
             WHERE user_id = $1::uuid AND type = 'user'
             ORDER BY created_at ASC LIMIT 1
            """,
            ancestor_id,
        )
        if ancestor_addr is None:
            continue

        await _ensure_mining_pool_funded(conn, amount)

        txid = compute_txid(
            from_addr=MINING_POOL_ADDRESS, to_addr=str(ancestor_addr),
            amount=amount, fee=Decimal(0), tx_type="referral_reward",
            nonce=secrets.token_hex(8),
        )
        await conn.fetchval(
            "SELECT swypik_apply_tx($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
            txid, None, MINING_POOL_ADDRESS, str(ancestor_addr),
            amount, Decimal(0), "referral_reward",
            f"L{level} passive from {user_id[:8]}", "{}",
        )
        await conn.execute(
            """
            UPDATE swypik_referral_network
               SET total_earned_passive = total_earned_passive + $3
             WHERE user_id = $1::uuid AND ancestor_id = $2::uuid
            """,
            user_id, ancestor_id, amount,
        )
