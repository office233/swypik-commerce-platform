/**
 * GitHub Models token rotation helper.
 *
 * Sursă tokens (în ordine de precedență):
 *  1. `GITHUB_MODELS_TOKENS` — CSV (`ghu_a,ghu_b,ghu_c`). Sursa preferată.
 *  2. `GITHUB_MODELS_TOKEN_1`, `_2`, `_3` — individuali.
 *  3. `GITHUB_MODELS_TOKEN` (legacy) sau `GITHUB_TOKEN` / `GH_PAT` — fallback.
 *
 * NB: token-urile `ghu_*` sunt user-to-server (OAuth) — pot avea scope limitat
 * pentru endpoint-ul de inference. Pe 403 no_access / 401 / 429 rotim automat
 * la următorul token.
 */

let _tokensCache: string[] | null = null;

export function getGithubModelsTokens(): string[] {
  if (_tokensCache) return _tokensCache;
  const out: string[] = [];
  const csv = process.env.GITHUB_MODELS_TOKENS;
  if (csv && csv.trim()) {
    for (const t of csv.split(',').map((s) => s.trim()).filter(Boolean)) {
      out.push(t);
    }
  }
  for (const key of ['GITHUB_MODELS_TOKEN_1', 'GITHUB_MODELS_TOKEN_2', 'GITHUB_MODELS_TOKEN_3']) {
    const v = process.env[key];
    if (v && v.trim() && !out.includes(v.trim())) out.push(v.trim());
  }
  for (const key of ['GITHUB_MODELS_TOKEN', 'GITHUB_TOKEN', 'GH_PAT']) {
    const v = process.env[key];
    if (v && v.trim() && !out.includes(v.trim())) out.push(v.trim());
  }
  _tokensCache = out;
  return out;
}

export function _resetTokenCache() {
  _tokensCache = null;
}

export type GithubModelsFetchResult = {
  res: Response;
  tokenIndex: number;
};

/**
 * fetch() rotind token-urile pe răspunsuri retriable (401/403/429).
 * Caller-ul trebuie să furnizeze un init re-emisibil (body string/Buffer/FormData).
 */
export async function fetchWithGithubModelsTokens(
  url: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<GithubModelsFetchResult> {
  const tokens = getGithubModelsTokens();
  if (tokens.length === 0) {
    throw new Error('No GitHub Models tokens configured (GITHUB_MODELS_TOKENS / GITHUB_TOKEN missing)');
  }

  let lastRes: Response | null = null;
  let lastIdx = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const headers: Record<string, string> = { ...(init.headers || {}) };
    headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...init, headers });
    lastRes = res;
    lastIdx = i;
    if (res.ok) return { res, tokenIndex: i };
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      const tail = token.slice(-4);
      // eslint-disable-next-line no-console
      console.warn(`[github-models] token #${i + 1} (…${tail}) → ${res.status}, retrying`);
      continue;
    }
    return { res, tokenIndex: i };
  }
  return { res: lastRes as Response, tokenIndex: lastIdx };
}
