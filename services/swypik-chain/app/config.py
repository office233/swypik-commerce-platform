"""Runtime configuration loaded from env vars (12-factor)."""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="SWYPIK_CHAIN_", extra="ignore")

    # Service
    env: str = Field(default="development")
    log_level: str = Field(default="INFO")
    service_token: str = Field(default="dev-internal-token-change-me")

    # Database (reuses main swypik Postgres)
    database_url: str = Field(
        default="postgresql://swypik:swypik@postgres:5432/swypik",
        description="asyncpg connection string",
    )
    db_pool_min: int = Field(default=2)
    db_pool_max: int = Field(default=10)

    # Redis (for rate limits + caching)
    redis_url: str = Field(default="redis://redis:6379/3")

    # Chain
    block_time_seconds: int = Field(default=10)
    chain_id: str = Field(default="swypik-mainnet-1")
    genesis_height: int = Field(default=0)

    # Mining
    base_reward_swyp: float = Field(default=2.0)         # base per tap
    max_daily_reward: float = Field(default=500.0)       # anti-whale cap
    streak_max_days: int = Field(default=50)
    streak_bonus_per_day_pct: float = Field(default=2.0) # +2% per day, max 100%
    kyc_bonus_pct: float = Field(default=50.0)
    pioneer_bonus_pct: float = Field(default=100.0)
    circle_member_bonus_pct: float = Field(default=10.0)  # per member, max 5
    ref_l1_bonus_pct: float = Field(default=10.0)         # per active L1 ref (UNLIMITED)
    ref_l2_bonus_pct: float = Field(default=5.0)
    ref_l3_bonus_pct: float = Field(default=2.0)
    ref_passive_l1_pct: float = Field(default=10.0)       # 10% of L1 mining
    ref_passive_l2_pct: float = Field(default=5.0)
    ref_passive_l3_pct: float = Field(default=2.0)
    daily_claim_window_hours: int = Field(default=24)
    streak_reset_hours: int = Field(default=48)

    # Bridges
    bsc_rpc_url: str = Field(default="")
    polygon_rpc_url: str = Field(default="")
    ethereum_rpc_url: str = Field(default="")
    solana_rpc_url: str = Field(default="")
    bitcoin_rpc_url: str = Field(default="")
    bridge_hot_wallet_seed: str = Field(default="")       # encrypted in prod
    bridge_min_confirmations_default: int = Field(default=12)

    # DEX
    dex_default_fee_bps: int = Field(default=30)          # 0.30%

    # Pre-sale
    presale_price_usd: float = Field(default=0.05)
    presale_vesting_months: int = Field(default=6)


@lru_cache
def get_settings() -> Settings:
    return Settings()
