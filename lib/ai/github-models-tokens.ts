/**
 * GitHub Copilot API client — 2-pass auth.
 *
 * Cum funcționează:
 *   1. ghu_* (user OAuth token) → schimb la api.github.com/copilot_internal/v2/token
 *      → primesc session token + endpoint URL (business/individual).
 *   2. Apel /embeddings sau /chat/completions cu session token-ul + Editor headers.
 *
 * Session token-ul are TTL ~30 min (expires_at). Cache pe disk + în-memory cu refresh.
 * Rotăm prin token-urile ghu_* dacă apare 401/403/429 la pasul 2.
 */

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CACHE_FILE = join(tmpdir(), 'swypik-copilot-sessions.json');

type SessionCache = {
  token: string;
  endpoint: string;
  expiresAt: number; // unix seconds
};

let _memCache: Map<string, SessionCache> = new Map();
let _diskLoaded = false;

const EDITOR_HEADERS: Record<string, string> = {
  'Editor-Version': 'vscode/1.95.0',
  'Editor-Plugin-Version': 'copilot-chat/0.20.0',
  'User-Agent': 'GitHubCopilotChat/0.20.0',
  'Copilot-Integration-Id': 'vscode-chat',
};

export function getCopilotGhuTokens(): string[] {
  const out: string[] = [];
  const csv = process.env.GITHUB_MODELS_TOKENS;
  if (csv && csv.trim()) {
    for (const t of csv.split(',').map((s) => s.trim()).filter(Boolean)) out.push(t);
  }
  for (const key of ['GITHUB_MODELS_TOKEN_1', 'GITHUB_MODELS_TOKEN_2', 'GITHUB_MODELS_TOKEN_3']) {
    const v = process.env[key];
    if (v && v.trim() && !out.includes(v.trim())) out.push(v.trim());
  }
  for (const key of ['GITHUB_MODELS_TOKEN', 'GITHUB_TOKEN', 'GH_PAT']) {
    const v = process.env[key];
    if (v && v.trim() && !out.includes(v.trim())) out.push(v.trim());
  }
  return out;
}

async function loadDiskCache(): Promise<void> {
  if (_diskLoaded) return;
  _diskLoaded = true;
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const obj = JSON.parse(raw) as Record<string, SessionCache>;
    for (const [k, v] of Object.entries(obj)) _memCache.set(k, v);
  } catch {
    /* file missing — ok */
  }
}

async function saveDiskCache(): Promise<void> {
  const obj: Record<string, SessionCache> = {};
  for (const [k, v] of _memCache.entries()) obj[k] = v;
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(obj), 'utf8');
  } catch {
    /* ignore */
  }
}

async function fetchSessionToken(ghu: string): Promise<SessionCache> {
  const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: { ...EDITOR_HEADERS, Authorization: `token ${ghu}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Copilot session exchange ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    token?: string;
    expires_at?: number;
    endpoints?: { api?: string };
  };
  const token = json.token;
  const endpoint = json.endpoints?.api;
  const expiresAt = json.expires_at;
  if (!token || !endpoint || !expiresAt) throw new Error('Copilot session response missing fields');
  return { token, endpoint, expiresAt };
}

async function getSession(ghu: string): Promise<SessionCache> {
  await loadDiskCache();
  const now = Math.floor(Date.now() / 1000);
  const cached = _memCache.get(ghu);
  // refresh 60s before expiry
  if (cached && cached.expiresAt - 60 > now) return cached;
  const fresh = await fetchSessionToken(ghu);
  _memCache.set(ghu, fresh);
  void saveDiskCache();
  return fresh;
}

export type CopilotFetchResult = {
  res: Response;
  tokenIndex: number;
  endpoint: string;
};

/**
 * Fetch împotriva endpoint-ului Copilot (api.business.githubcopilot.com sau similar).
 * Path-ul se concatenează la endpoint-ul descoperit (de ex. `/embeddings`, `/chat/completions`).
 *
 * Rotim între token-urile ghu_* pe 401/403/429. Pe alte status-uri returnăm direct.
 */
/**
 * gpt-5 family quirks via Copilot API:
 *  - max_tokens → max_completion_tokens
 *  - temperature must be default (omit)
 *  - response_format=json_object requires the literal word "json" in messages
 */
function normalizeGpt5Body(init: RequestInit & { headers?: Record<string, string> }): RequestInit & { headers?: Record<string, string> } {
  if (!init || !init.body || typeof init.body !== "string") return init;
  let obj: any;
  try { obj = JSON.parse(init.body); } catch { return init; }
  const model: string = String(obj?.model || "");
  if (!model.startsWith("gpt-5")) return init;
  if (typeof obj.max_tokens === "number" && obj.max_completion_tokens === undefined) {
    obj.max_completion_tokens = obj.max_tokens;
  }
  delete obj.max_tokens;
  delete obj.temperature;
  const wantsJson = obj?.response_format?.type === "json_object";
  if (wantsJson && Array.isArray(obj.messages)) {
    const haveJsonWord = obj.messages.some((m: any) => typeof m?.content === "string" && /json/i.test(m.content));
    if (!haveJsonWord) {
      obj.messages = [{ role: "system", content: "Reply ONLY with valid JSON." }, ...obj.messages];
    }
  }
  return { ...init, body: JSON.stringify(obj) };
}

export async function fetchCopilot(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<CopilotFetchResult> {
  const tokens = getCopilotGhuTokens();
  if (tokens.length === 0) {
    throw new Error('No Copilot tokens configured (GITHUB_MODELS_TOKENS / GITHUB_TOKEN missing)');
  }
  let lastRes: Response | null = null;
  let lastIdx = 0;
  let lastEndpoint = '';
  for (let i = 0; i < tokens.length; i++) {
    const ghu = tokens[i];
    let session: SessionCache;
    try {
      session = await getSession(ghu);
    } catch (e) {
      const tail = ghu.slice(-4);
      // eslint-disable-next-line no-console
      console.warn(`[copilot] session exchange failed for …${tail}: ${(e as Error).message}`);
      continue;
    }
    const url = session.endpoint.replace(/\/+$/, '') + (path.startsWith('/') ? path : '/' + path);
    const headers: Record<string, string> = { ...EDITOR_HEADERS, ...(init.headers || {}) };
    headers['Authorization'] = `Bearer ${session.token}`;
    const normalized = normalizeGpt5Body(init);
    const res = await fetch(url, { ...normalized, headers });
    lastRes = res;
    lastIdx = i;
    lastEndpoint = url;
    if (res.ok) return { res, tokenIndex: i, endpoint: url };
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      const tail = ghu.slice(-4);
      // invalidate session — refetch next time
      _memCache.delete(ghu);
      // eslint-disable-next-line no-console
      console.warn(`[copilot] token #${i + 1} (…${tail}) → ${res.status}, rotating`);
      continue;
    }
    return { res, tokenIndex: i, endpoint: url };
  }
  return { res: lastRes as Response, tokenIndex: lastIdx, endpoint: lastEndpoint };
}

// Backward-compat exports (old name used by embeddings.ts)
export { getCopilotGhuTokens as getGithubModelsTokens };
export { fetchCopilot as fetchWithGithubModelsTokens };
