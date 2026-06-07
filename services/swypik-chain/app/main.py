"""SwypikChain FastAPI entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app import db
from app.api import routes_chain, routes_mining
from app.config import get_settings
from app.logging_setup import setup_logging

setup_logging()
log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    log.info("service_starting", env=settings.env, chain_id=settings.chain_id)
    await db.init_pool()
    yield
    await db.close_pool()
    log.info("service_stopped")


app = FastAPI(
    title="SwypikChain",
    description="$SWYP token core — mining, transfers, bridges, DEX.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)

app.include_router(routes_chain.router)
app.include_router(routes_mining.router)


@app.get("/health", tags=["meta"])
async def health() -> JSONResponse:
    try:
        ok = await db.fetchval("SELECT 1")
        return JSONResponse({"status": "ok", "db": ok == 1})
    except Exception as exc:
        log.error("healthcheck_failed", error=str(exc))
        return JSONResponse({"status": "degraded", "error": str(exc)}, status_code=503)


@app.get("/", tags=["meta"])
async def root() -> dict:
    return {"service": "swypik-chain", "version": "0.1.0", "docs": "/docs"}
