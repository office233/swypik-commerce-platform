"""Mining endpoints: challenge, claim, stats, leaderboard."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app import db
from app.api.deps import require_internal_token, require_user_id
from app.mining.daily_claim import ClaimError, claim_daily
from app.mining.multipliers import compute_for_user
from app.mining.tappow import issue_challenge, verify_proof


# ---------------------------------------------------------------------------
# Anti-abuse: block system account + accounts with no verified email
# ---------------------------------------------------------------------------
SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"


async def _require_legitimate_user(user_id: str) -> None:
    """Reject mining attempts from system or unverified accounts."""
    if user_id == SYSTEM_USER_ID:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "system_account", "message": "System account cannot mine."},
        )
    row = await db.fetchrow(
        "SELECT email, email_verified_at, username FROM users WHERE id = $1::uuid",
        user_id,
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "no_user", "message": "User not found."},
        )
    email = row["email"]
    if not email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "no_email", "message": "Sign up with a real email to start mining."},
        )
    if row["email_verified_at"] is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "email_not_verified", "message": "Please verify your email to start mining."},
        )
    username = row["username"] or ""
    if username.startswith("anon_") or username.startswith("audit") or username.startswith("test"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "non_human_account", "message": "This account type cannot mine."},
        )


router = APIRouter(prefix="/v1/mining", tags=["mining"])


class ClaimRequest(BaseModel):
    challenge: str = Field(..., min_length=64, max_length=64)
    nonce: str = Field(..., min_length=1, max_length=64)
    issued_at: int
    device_hash: str = Field(default="", max_length=128)


@router.post("/challenge", dependencies=[Depends(require_internal_token)])
async def get_challenge(user_id: str = Depends(require_user_id)) -> dict:
    await _require_legitimate_user(user_id)
    return issue_challenge(user_id)


@router.post("/claim", dependencies=[Depends(require_internal_token)])
async def claim(
    request: Request,
    body: ClaimRequest,
    user_id: str = Depends(require_user_id),
) -> dict:
    await _require_legitimate_user(user_id)
    if not verify_proof(user_id, body.challenge, body.nonce, body.issued_at):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_proof", "message": "TapPoW verification failed"},
        )

    ip_hash = (request.headers.get("x-forwarded-for") or request.client.host if request.client else "") or ""

    try:
        result = await claim_daily(
            user_id=user_id,
            tappow_proof=f"{body.challenge}:{body.nonce}",
            device_hash=body.device_hash,
            ip_hash=ip_hash[:128],
        )
    except ClaimError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS if exc.code == "already_claimed"
            else status.HTTP_400_BAD_REQUEST,
            detail={"code": exc.code, "message": exc.message, "retry_at": exc.retry_at},
        ) from exc

    return result


@router.get("/multiplier", dependencies=[Depends(require_internal_token)])
async def multiplier(user_id: str = Depends(require_user_id)) -> dict:
    mb = await compute_for_user(user_id)
    return mb.to_dict()


@router.get("/stats", dependencies=[Depends(require_internal_token)])
async def my_stats(user_id: str = Depends(require_user_id)) -> dict:
    row = await db.fetchrow(
        """
        SELECT total_mined, streak_current, streak_best, last_tap_at,
               daily_today, daily_cap, current_multiplier,
               refs_l1_active, refs_l2_active, refs_l3_active,
               refs_l1_total, refs_l2_total, refs_l3_total,
               kyc_face_verified, pioneer_badge, security_circle_count
          FROM swypik_mining_stats
         WHERE user_id = $1::uuid
        """,
        user_id,
    )
    if row is None:
        return {
            "total_mined": "0", "streak_current": 0, "streak_best": 0,
            "last_tap_at": None, "daily_today": "0", "daily_cap": "500",
            "current_multiplier": "1.0",
            "refs_l1_active": 0, "refs_l2_active": 0, "refs_l3_active": 0,
            "refs_l1_total": 0, "refs_l2_total": 0, "refs_l3_total": 0,
            "kyc_face_verified": False, "pioneer_badge": False,
            "security_circle_count": 0,
        }
    return {
        "total_mined": str(row["total_mined"]),
        "streak_current": int(row["streak_current"]),
        "streak_best": int(row["streak_best"]),
        "last_tap_at": row["last_tap_at"].isoformat() if row["last_tap_at"] else None,
        "daily_today": str(row["daily_today"]),
        "daily_cap": str(row["daily_cap"]),
        "current_multiplier": str(row["current_multiplier"]),
        "refs_l1_active": int(row["refs_l1_active"]),
        "refs_l2_active": int(row["refs_l2_active"]),
        "refs_l3_active": int(row["refs_l3_active"]),
        "refs_l1_total": int(row["refs_l1_total"]),
        "refs_l2_total": int(row["refs_l2_total"]),
        "refs_l3_total": int(row["refs_l3_total"]),
        "kyc_face_verified": bool(row["kyc_face_verified"]),
        "pioneer_badge": bool(row["pioneer_badge"]),
        "security_circle_count": int(row["security_circle_count"]),
    }


@router.get("/leaderboard", dependencies=[Depends(require_internal_token)])
async def leaderboard(limit: int = 50) -> dict:
    limit = max(1, min(limit, 200))
    rows = await db.fetch(
        """
        SELECT u.id AS user_id, u.username, u.display_name,
               ms.total_mined, ms.streak_current,
               ms.refs_l1_active, ms.current_multiplier
          FROM swypik_mining_stats ms
          JOIN users u ON u.id = ms.user_id
         WHERE ms.total_mined > 0
         ORDER BY ms.total_mined DESC
         LIMIT $1
        """,
        limit,
    )
    return {
        "top": [
            {
                "user_id": str(r["user_id"]),
                "handle": r["username"],
                "display_name": r["display_name"],
                "total_mined": str(r["total_mined"]),
                "streak": int(r["streak_current"]),
                "refs": int(r["refs_l1_active"]),
                "multiplier": str(r["current_multiplier"]),
            }
            for r in rows
        ]
    }
