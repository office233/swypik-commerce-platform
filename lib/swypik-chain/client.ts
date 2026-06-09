// Server-only client for the Python swypik-chain service.
// Uses the internal shared secret (X-Internal-Token) — NEVER call from browser.

import "server-only";

const BASE_URL = process.env.SWYPIK_CHAIN_URL ?? "http://swypik-chain:8090";
const INTERNAL_TOKEN = process.env.SWYPIK_CHAIN_TOKEN ?? "dev-internal-token-change-me";

export class SwypikChainError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public retryAt?: string,
  ) {
    super(message);
    this.name = "SwypikChainError";
  }
}

type FetchOpts = {
  method?: "GET" | "POST";
  body?: unknown;
  /** Optional — set only for per-user endpoints. Omit for public endpoints. */
  userId?: string;
  signal?: AbortSignal;
  cache?: RequestCache;
};

export async function swypikFetch<T>(path: string, opts: FetchOpts): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: {
      "X-Internal-Token": INTERNAL_TOKEN,
      ...(opts.userId ? { "X-User-Id": opts.userId } : {}),
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    cache: opts.cache ?? "no-store",
  };

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new SwypikChainError(
      `Network error talking to swypik-chain: ${(err as Error).message}`,
      503,
      "network_error",
    );
  }

  if (!res.ok) {
    let detail: unknown = null;
    try { detail = await res.json(); } catch { /* ignore */ }
    const det = (detail as { detail?: { code?: string; message?: string; retry_at?: string } } | null)?.detail;
    throw new SwypikChainError(
      det?.message ?? `swypik-chain ${res.status}`,
      res.status,
      det?.code,
      det?.retry_at,
    );
  }
  return res.json() as Promise<T>;
}
