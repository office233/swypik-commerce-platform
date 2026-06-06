"""Chain info + balance + transactions endpoints."""
from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, Query

from app import db
from app.api.deps import require_internal_token, require_user_id
from app.chain.wallet import get_balance, get_or_create_user_address

router = APIRouter(prefix="/v1/chain", tags=["chain"])


@router.get("/info", dependencies=[Depends(require_internal_token)])
async def chain_info() -> dict:
    """Public chain stats (no user context)."""
    row = await db.fetchrow(
        """
        SELECT
          (SELECT COUNT(*) FROM swypik_blocks) AS blocks,
          (SELECT COUNT(*) FROM swypik_token_txs) AS txs,
          (SELECT COUNT(*) FROM swypik_addresses) AS addresses,
          (SELECT COALESCE(SUM(balance), 0) FROM swypik_token_balances) AS supply
        """
    )
    return {
        "chain_id": "swypik-mainnet-1",
        "total_blocks": int(row["blocks"]),
        "total_txs": int(row["txs"]),
        "total_addresses": int(row["addresses"]),
        "circulating_supply": str(Decimal(str(row["supply"] or 0))),
        "hard_cap": "21000000",
    }


@router.get("/address", dependencies=[Depends(require_internal_token)])
async def get_address(user_id: str = Depends(require_user_id)) -> dict:
    address = await get_or_create_user_address(user_id)
    return {"address": address}


@router.get("/balance", dependencies=[Depends(require_internal_token)])
async def balance(user_id: str = Depends(require_user_id)) -> dict:
    address = await get_or_create_user_address(user_id)
    bal = await get_balance(address)
    return {"address": address, **bal}


@router.get("/transactions", dependencies=[Depends(require_internal_token)])
async def list_txs(
    user_id: str = Depends(require_user_id),
    limit: int = Query(default=50, le=200, ge=1),
    cursor: str | None = Query(default=None),
) -> dict:
    address = await get_or_create_user_address(user_id)
    if cursor:
        rows = await db.fetch(
            """
            SELECT txid, block_height, from_address, to_address, amount, fee,
                   tx_type, memo, created_at
              FROM swypik_token_txs
             WHERE (from_address = $1 OR to_address = $1)
               AND created_at < $2::timestamptz
             ORDER BY created_at DESC
             LIMIT $3
            """,
            address, cursor, limit,
        )
    else:
        rows = await db.fetch(
            """
            SELECT txid, block_height, from_address, to_address, amount, fee,
                   tx_type, memo, created_at
              FROM swypik_token_txs
             WHERE (from_address = $1 OR to_address = $1)
             ORDER BY created_at DESC
             LIMIT $2
            """,
            address, limit,
        )
    items = [
        {
            "txid": r["txid"],
            "block_height": r["block_height"],
            "from": r["from_address"],
            "to": r["to_address"],
            "amount": str(r["amount"]),
            "fee": str(r["fee"]),
            "type": r["tx_type"],
            "memo": r["memo"],
            "created_at": r["created_at"].isoformat(),
            "direction": "in" if r["to_address"] == address else "out",
        }
        for r in rows
    ]
    next_cursor = items[-1]["created_at"] if len(items) == limit else None
    return {"items": items, "next_cursor": next_cursor}
