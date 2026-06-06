"""SwypikChain address generation (bech32-style: swyp1...)."""
from __future__ import annotations

import hashlib
import secrets

import base58

ADDRESS_PREFIX = "swyp1"
ADDRESS_BODY_LEN = 38  # total length of body after prefix


def _b58_lower(data: bytes) -> str:
    """Base58 encode lowercased (chain uses [0-9a-z] charset constraint)."""
    return base58.b58encode(data).decode("ascii").lower()


def generate_address(user_id: str) -> tuple[str, str]:
    """Generate a new swyp1xxx address for a user.

    Returns (address, pubkey_hex). The pubkey here is a deterministic
    derivation seed; full ed25519 signing is done in app.chain.tx_builder.
    """
    # Random seed for this address
    seed = secrets.token_bytes(32)
    pubkey = hashlib.blake2b(user_id.encode() + seed, digest_size=32).digest()
    addr_hash = hashlib.blake2b(pubkey, digest_size=24).digest()
    body = _b58_lower(addr_hash)[:ADDRESS_BODY_LEN]
    return f"{ADDRESS_PREFIX}{body}", pubkey.hex()


def is_valid_address(addr: str) -> bool:
    """Check address matches the on-chain regex constraint."""
    if not addr.startswith(ADDRESS_PREFIX):
        return False
    body = addr[len(ADDRESS_PREFIX):]
    if not (32 <= len(body) <= 62):
        return False
    return all(c.isdigit() or ("a" <= c <= "z") for c in body)
