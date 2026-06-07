"""Rate-based mining (Pi Network style): open 24h sessions.

Flow:
  1. POST /v1/mining/run/start  -> creates open run, returns rate + ends_at
  2. GET  /v1/mining/run/status -> client polls (or computes locally) the accrued amount
  3. POST /v1/mining/run/claim  -> closes run, mints `elapsed_hours * rate * multiplier`

Concurrency:
  - Postgres unique partial index ensures only ONE open run per user.
  - Advisory lock on user_id during claim to prevent double-mint.

Anti-abuse:
  - Multiplier snapshot is taken at claim time (current state, including any
    refs that became active during the run).
  - Daily cap (anti-whale) still enforced.
  - Elapsed time capped at duration_hours (no farming by leaving run open >24h).
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import structlog

from app import db
from app.chain.tx_builder import compute_txid
from app.chain.wallet import get_or_create_user_address
from app.config import get_settings
from app.mining.multipliers import compute_for_user

log = structlog.get_logger(__name__)

MINING_POOL_ADDRESS = "swyp1miningrewardspool00000000000000000a0"
DEFAULT_DURATION_HOURS = Decimal("24.0")


class RunError(Exception):
    """Raised when start/claim is rejected."""

    def __init__(self, code: str, message: str, **extra: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.extra = extra


# ---------------------------------------------------------------------------
# START
# ---------------------------------------------------------------------------
async def start_run(user_id: str, device_hash: str, ip_hash: str) -> dict:
    """Open a new 24h mining run. Fails if user already has an open run."""
    address = await get_or_create_user_address(user_id)

    async with db.get_pool().acquire() as conn:
        async with conn.transaction():
            # Pick the current epoch (snapshot for this run)
            epoch = await conn.fetchrow("SELECT * FROM swypik_current_epoch(now())")
            if epoch is None:
                raise RunError(
                    "no_active_epoch",
                    "Mining is paused — no active epoch configured.",
                )

            now = datetime.now(timezone.utc)
            ends_at = now + timedelta(hours=float(DEFAULT_DURATION_HOURS))

            try:
                row = await conn.fetchrow(
                    """
                    INSERT INTO swypik_mining_runs
                      (user_id, address, started_at, ends_at,
                       epoch_no, base_rate_per_hour, duration_hours,
                       device_hash, ip_hash)
                    VALUES
                      ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING id, started_at, ends_at, base_rate_per_hour, duration_hours
                    """,
                    user_id, address, now, ends_at,
                    int(epoch["epoch_no"]), epoch["base_rate_per_hour"],
                    DEFAULT_DURATION_HOURS,
                    device_hash[:128], ip_hash[:128],
                )
            except Exception as exc:  # noqa: BLE001
                # Unique index violation → already mining
                if "uniq_swypik_mining_runs_open" in str(exc):
                    open_run = await conn.fetchrow(
                        """
                        SELECT id, started_at, ends_at, base_rate_per_hour
                          FROM swypik_mining_runs
                         WHERE user_id = $1::uuid AND claimed_at IS NULL
                         LIMIT 1
                        """,
                        user_id,
                    )
                    raise RunError(
                        "already_mining",
                        "You already have an active mining run.",
                        run_id=str(open_run["id"]) if open_run else "",
                        ends_at=open_run["ends_at"].isoformat() if open_run else "",
                    ) from exc
                raise

    # Compute current multiplier for display only (real one is snapshotted at claim)
    mult = await compute_for_user(user_id)

    log.info(
        "mining_run_started",
        user_id=user_id,
        run_id=str(row["id"]),
        rate=str(row["base_rate_per_hour"]),
        ends_at=row["ends_at"].isoformat(),
    )

    return {
        "run_id": str(row["id"]),
        "started_at": row["started_at"].isoformat(),
        "ends_at": row["ends_at"].isoformat(),
        "duration_hours": str(row["duration_hours"]),
        "base_rate_per_hour": str(row["base_rate_per_hour"]),
        "current_multiplier": str(mult.total_multiplier),
        "effective_rate_per_hour": str(
            (row["base_rate_per_hour"] * mult.total_multiplier).quantize(Decimal("0.000000001"))
        ),
    }


# ---------------------------------------------------------------------------
# STATUS (read-only, for polling / page load)
# ---------------------------------------------------------------------------
async def get_run_status(user_id: str) -> dict:
    """Return the open run (if any) + current accrued amount."""
    row = await db.fetchrow(
        """
        SELECT id, started_at, ends_at, base_rate_per_hour, duration_hours
          FROM swypik_mining_runs
         WHERE user_id = $1::uuid AND claimed_at IS NULL
         ORDER BY started_at DESC
         LIMIT 1
        """,
        user_id,
    )

    if row is None:
        # No active run — also surface the next epoch info for UX
        epoch = await db.fetchrow("SELECT * FROM swypik_current_epoch(now())")
        return {
            "active": False,
            "base_rate_per_hour": str(epoch["base_rate_per_hour"]) if epoch else "0",
            "next_duration_hours": str(DEFAULT_DURATION_HOURS),
        }

    now = datetime.now(timezone.utc)
    started_at = row["started_at"]
    ends_at = row["ends_at"]
    rate = Decimal(str(row["base_rate_per_hour"]))
    duration_h = Decimal(str(row["duration_hours"]))

    # Elapsed in hours, capped at duration
    elapsed_seconds = (min(now, ends_at) - started_at).total_seconds()
    elapsed_h = Decimal(str(elapsed_seconds / 3600.0)).quantize(Decimal("0.000001"))

    mult = await compute_for_user(user_id)
    effective_rate = (rate * mult.total_multiplier).quantize(Decimal("0.000000001"))
    accrued = (elapsed_h * effective_rate).quantize(Decimal("0.000000001"))

    ready = now >= ends_at

    return {
        "active": True,
        "run_id": str(row["id"]),
        "started_at": started_at.isoformat(),
        "ends_at": ends_at.isoformat(),
        "now": now.isoformat(),
        "duration_hours": str(duration_h),
        "elapsed_hours": str(elapsed_h),
        "base_rate_per_hour": str(rate),
        "current_multiplier": str(mult.total_multiplier),
        "effective_rate_per_hour": str(effective_rate),
        "accrued_so_far": str(accrued),
        "ready_to_claim": ready,
    }


# ---------------------------------------------------------------------------
# CLAIM
# ---------------------------------------------------------------------------
async def claim_run(user_id: str) -> dict:
    """Close the open run and mint accrued $SWYP. Atomic."""
    s = get_settings()
    address = await get_or_create_user_address(user_id)

    lock_key = abs(hash(("swypik_run_claim", user_id))) % (2**31)

    async with db.get_pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock($1)", lock_key)

            run = await conn.fetchrow(
                """
                SELECT id, address, started_at, ends_at,
                       base_rate_per_hour, duration_hours
                  FROM swypik_mining_runs
                 WHERE user_id = $1::uuid AND claimed_at IS NULL
                 ORDER BY started_at DESC
                 LIMIT 1
                 FOR UPDATE
                """,
                user_id,
            )
            if run is None:
                raise RunError("no_active_run", "No active mining run to claim. Start one first.")

            now = datetime.now(timezone.utc)
            started_at = run["started_at"]
            ends_at = run["ends_at"]
            rate = Decimal(str(run["base_rate_per_hour"]))

            # Elapsed hours, capped at run duration (no farming by leaving open)
            elapsed_seconds = (min(now, ends_at) - started_at).total_seconds()
            if elapsed_seconds < 60:
                raise RunError(
                    "too_early",
                    "Mining just started — wait a bit before claiming.",
                    elapsed_seconds=str(int(elapsed_seconds)),
                )
            elapsed_h = Decimal(str(elapsed_seconds / 3600.0))

            # Snapshot multiplier NOW
            mult = await compute_for_user(user_id)
            raw_reward = (elapsed_h * rate * mult.total_multiplier).quantize(Decimal("0.000000001"))

            # Daily cap (per-UTC-day, on swypik_mining_stats.daily_today)
            stats = await conn.fetchrow(
                """
                SELECT last_tap_at, daily_today, daily_cap, streak_current
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

            # Reset daily_today if crossed UTC midnight
            today_midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
            if last_tap is None or last_tap < today_midnight:
                daily_today = Decimal(0)

            remaining_cap = daily_cap - daily_today
            if remaining_cap <= 0:
                raise RunError("daily_cap_reached", "Daily mining cap reached. Try tomorrow.")

            final_reward = min(raw_reward, remaining_cap).quantize(Decimal("0.000000001"))
            if final_reward <= 0:
                raise RunError("zero_reward", "Computed reward is zero — try again later.")

            # Streak: claim within 48h of last_tap_at keeps streak
            if last_tap is not None:
                gap_hours = (now - last_tap).total_seconds() / 3600
                if gap_hours <= s.streak_reset_hours:
                    new_streak = streak + 1 if (last_tap is None or last_tap < today_midnight) else streak
                else:
                    new_streak = 1
            else:
                new_streak = 1

            # Mint
            from app.mining.daily_claim import _ensure_mining_pool_funded, _distribute_passive_referral_rewards
            await _ensure_mining_pool_funded(conn, final_reward)

            txid = compute_txid(
                from_addr=MINING_POOL_ADDRESS,
                to_addr=address,
                amount=final_reward,
                fee=Decimal(0),
                tx_type="mining_reward",
                nonce=secrets.token_hex(8),
            )
            await conn.fetchval(
                "SELECT swypik_apply_tx($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
                txid, None, MINING_POOL_ADDRESS, address,
                final_reward, Decimal(0), "mining_reward",
                f"Run claim — {elapsed_h:.2f}h × {rate}/h × ×{mult.total_multiplier}", "{}",
            )

            # Close the run
            await conn.execute(
                """
                UPDATE swypik_mining_runs
                   SET claimed_at = $2,
                       multiplier_at_claim = $3,
                       multiplier_breakdown = $4::jsonb,
                       final_reward = $5,
                       tx_id = $6,
                       updated_at = now()
                 WHERE id = $1
                """,
                run["id"], now, mult.total_multiplier,
                str(mult.to_dict()).replace("'", '"'),
                final_reward, txid,
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

            # Audit log (re-use existing sessions table)
            await conn.execute(
                """
                INSERT INTO swypik_mining_sessions
                  (user_id, address, session_type, base_reward, multiplier,
                   final_reward, tappow_proof, device_hash, ip_hash,
                   multiplier_breakdown, tx_id)
                VALUES
                  ($1::uuid, $2, 'daily_tap', $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
                """,
                user_id, address, raw_reward / mult.total_multiplier if mult.total_multiplier > 0 else raw_reward,
                mult.total_multiplier, final_reward,
                f"run:{run['id']}", "", "",
                str(mult.to_dict()).replace("'", '"'),
                txid,
            )

            # Passive referral payouts
            await _distribute_passive_referral_rewards(conn, user_id, final_reward)

            log.info(
                "mining_run_claimed",
                user_id=user_id,
                run_id=str(run["id"]),
                elapsed_h=str(elapsed_h),
                reward=str(final_reward),
                streak=new_streak,
            )

            return {
                "run_id": str(run["id"]),
                "elapsed_hours": str(elapsed_h.quantize(Decimal("0.01"))),
                "reward": str(final_reward),
                "multiplier": str(mult.total_multiplier),
                "streak": new_streak,
                "txid": txid,
                "claimed_at": now.isoformat(),
            }
