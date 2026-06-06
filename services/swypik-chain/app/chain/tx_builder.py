"""Transaction ID computation + ledger insertion helper."""
from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from typing import Any

from app import db


def compute_txid(
    from_addr: str | None,
    to_addr: str,
    amount: Decimal,
    fee: Decimal,
    tx_type: str,
    nonce: str,
) -> str:
    """Deterministic txid = sha256(canonical payload)."""
    payload = {
        "from": from_addr or "",
        "to": to_addr,
        "amount": str(amount),
        "fee": str(fee),
        "type": tx_type,
        "nonce": nonce,
    }
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return hashlib.sha256(raw).hexdigest()


async def apply_tx(
    *,
    txid: str,
    block_height: int | None,
    from_addr: str | None,
    to_addr: str,
    amount: Decimal,
    fee: Decimal,
    tx_type: str,
    memo: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    """Calls the atomic swypik_apply_tx() Postgres function."""
    meta_json = json.dumps(metadata or {})
    result = await db.fetchval(
        """
        SELECT swypik_apply_tx(
            $1::text, $2::bigint, $3::text, $4::text,
            $5::numeric, $6::numeric, $7::text, $8::text, $9::jsonb
        )
        """,
        txid,
        block_height,
        from_addr,
        to_addr,
        amount,
        fee,
        tx_type,
        memo,
        meta_json,
    )
    return str(result)
