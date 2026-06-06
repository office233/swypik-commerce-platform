"""TapPoW: lightweight proof-of-work to prevent bot mining.

The client must find a nonce such that:
   sha256(user_id || challenge || nonce) starts with N hex zeros.

Difficulty is adaptive: easy enough for a phone (~1s) but hard
enough that headless bots can't farm 1000 accounts cheaply.
"""
from __future__ import annotations

import hashlib
import secrets
import time

DIFFICULTY_HEX_ZEROS = 4  # ~1s on a mid-range phone
CHALLENGE_TTL_SECONDS = 120


def issue_challenge(user_id: str) -> dict[str, str | int]:
    """Generates a fresh challenge for the client."""
    nonce_salt = secrets.token_hex(16)
    issued_at = int(time.time())
    challenge = hashlib.sha256(f"{user_id}|{nonce_salt}|{issued_at}".encode()).hexdigest()
    return {
        "challenge": challenge,
        "difficulty": DIFFICULTY_HEX_ZEROS,
        "issued_at": issued_at,
        "ttl": CHALLENGE_TTL_SECONDS,
    }


def verify_proof(user_id: str, challenge: str, nonce: str, issued_at: int) -> bool:
    """Verifies that the client found a valid nonce within the TTL."""
    now = int(time.time())
    if now - issued_at > CHALLENGE_TTL_SECONDS:
        return False
    if now < issued_at - 5:  # clock skew tolerance
        return False
    h = hashlib.sha256(f"{user_id}|{challenge}|{nonce}".encode()).hexdigest()
    return h.startswith("0" * DIFFICULTY_HEX_ZEROS)
