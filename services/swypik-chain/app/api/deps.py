"""Shared FastAPI dependencies (auth, user resolution)."""
from __future__ import annotations

from fastapi import Header, HTTPException, status

from app.config import get_settings


def require_internal_token(x_internal_token: str = Header(...)) -> None:
    """Verifies the Next.js gateway is calling us with the shared secret."""
    if x_internal_token != get_settings().service_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid internal token",
        )


def require_user_id(x_user_id: str = Header(...)) -> str:
    """Extracts the authenticated user id forwarded by the gateway."""
    if not x_user_id or len(x_user_id) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="missing or invalid X-User-Id header",
        )
    return x_user_id
