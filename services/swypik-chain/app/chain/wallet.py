"""Wallet bootstrap: ensure user has a swyp1 address + balance row."""
from __future__ import annotations

import structlog

from app import db
from app.chain.address import generate_address

log = structlog.get_logger(__name__)


async def get_or_create_user_address(user_id: str) -> str:
    """Returns the user's primary swyp1 address (creates it on first call)."""
    existing = await db.fetchval(
        """
        SELECT address FROM swypik_addresses
         WHERE user_id = $1::uuid AND type = 'user'
         ORDER BY created_at ASC
         LIMIT 1
        """,
        user_id,
    )
    if existing:
        return str(existing)

    address, pubkey = generate_address(user_id)
    async with db.get_pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                INSERT INTO swypik_addresses (address, user_id, pubkey, type, label)
                VALUES ($1, $2::uuid, $3, 'user', 'Primary')
                ON CONFLICT (address) DO NOTHING
                """,
                address,
                user_id,
                pubkey,
            )
            await conn.execute(
                """
                INSERT INTO swypik_token_balances (address, balance)
                VALUES ($1, 0)
                ON CONFLICT (address) DO NOTHING
                """,
                address,
            )
            await conn.execute(
                """
                INSERT INTO swypik_mining_stats (user_id)
                VALUES ($1::uuid)
                ON CONFLICT (user_id) DO NOTHING
                """,
                user_id,
            )
    log.info("address_created", user_id=user_id, address=address)
    return address


async def get_balance(address: str) -> dict[str, str]:
    row = await db.fetchrow(
        """
        SELECT balance, locked_stake, locked_presale,
               total_received, total_sent, total_mined
          FROM swypik_token_balances
         WHERE address = $1
        """,
        address,
    )
    if row is None:
        return {
            "balance": "0",
            "locked_stake": "0",
            "locked_presale": "0",
            "total_received": "0",
            "total_sent": "0",
            "total_mined": "0",
        }
    return {k: str(v) for k, v in dict(row).items()}
