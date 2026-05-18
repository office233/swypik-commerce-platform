/**
 * Embeddings helper — folosește GitHub Copilot embeddings API (2-pass auth).
 *
 * Token-uri: prin `lib/ai/github-models-tokens` (rotation pe 401/403/429).
 *   - GITHUB_MODELS_TOKENS (CSV) preferat
 *   - fallback: GITHUB_MODELS_TOKEN_{1,2,3}, GITHUB_MODELS_TOKEN, GITHUB_TOKEN, GH_PAT
 *
 * Endpoint dinamic (descoperit per token): `${endpoints.api}/embeddings`
 * Model: text-embedding-3-small (1536 dim).
 *
 * pgvector format: literal `[v1,v2,...]` text se cast-uiește implicit la `vector`.
 */

import { fetchCopilot, getCopilotGhuTokens } from './github-models-tokens';

const DEFAULT_MODEL =
  process.env.GITHUB_MODELS_EMBEDDING_MODEL || 'text-embedding-3-small';

export const EMBEDDING_DIM = 1536;

export class EmbeddingError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'EmbeddingError';
    this.status = status;
  }
}

export async function embed(text: string): Promise<number[]> {
  if (getCopilotGhuTokens().length === 0) {
    throw new EmbeddingError('GITHUB_MODELS_TOKENS / GITHUB_TOKEN missing');
  }

  const input = String(text || '').slice(0, 8000).trim();
  if (!input) throw new EmbeddingError('empty input');

  const { res } = await fetchCopilot('/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: [input], model: DEFAULT_MODEL }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new EmbeddingError(`Embed ${res.status}: ${body.slice(0, 200)}`, res.status);
  }

  const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const vec = json.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) {
    throw new EmbeddingError(`Unexpected embedding shape len=${vec?.length}`);
  }
  return vec;
}

/** Convert number[] → pgvector literal text `[v1,v2,...]` (cu precizie redusă pentru size). */
export function toPgVector(vec: number[]): string {
  return '[' + vec.map((v) => v.toFixed(6)).join(',') + ']';
}
