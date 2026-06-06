# SwypikChain Service

Python/FastAPI service exposing the **$SWYP token core**:

- mining (TapPoW + multipliers + daily claim)
- referral network (3 levels, **unlimited like Pi**)
- wallet (swyp1… addresses, balances, transactions)
- bridges (BSC, Polygon, Ethereum, Solana, Bitcoin — scaffold)
- DEX (AMM pools — scaffold)

## Run locally

```bash
cd services/swypik-chain
pip install -e ".[dev]"
export SWYPIK_CHAIN_DATABASE_URL="postgresql://swypik:swypik@localhost:5432/swypik"
uvicorn app.main:app --reload --port 8090
```

Open <http://localhost:8090/docs>.

## Endpoints (all require `X-Internal-Token` + `X-User-Id` headers)

| Path | Method | Purpose |
|---|---|---|
| `/v1/chain/info` | GET | public chain stats |
| `/v1/chain/address` | GET | get-or-create user address |
| `/v1/chain/balance` | GET | balance breakdown |
| `/v1/chain/transactions` | GET | paginated tx history |
| `/v1/mining/challenge` | POST | issue TapPoW challenge |
| `/v1/mining/claim` | POST | submit proof + claim reward |
| `/v1/mining/multiplier` | GET | multiplier breakdown |
| `/v1/mining/stats` | GET | per-user stats |
| `/v1/mining/leaderboard` | GET | global top miners |

## Architecture

```
Next.js (gateway, /api/swypik-token/*)
      │  X-Internal-Token + X-User-Id
      ▼
swypik-chain (this service, :8090)
      │
      ▼
Postgres (swypik_* tables + swypik_apply_tx fn)
```

The Next.js layer authenticates the user (Better-Auth) and forwards
requests with the shared internal token. swypik-chain never sees raw
user credentials.
