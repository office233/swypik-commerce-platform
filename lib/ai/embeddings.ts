/**
 * Embeddings helper — folosește GitHub Models inference API (același token GITHUB_TOKEN
 * ca restul stack-ului AI, vezi lib/ai/moderation.ts și app/api/ai/suggest-hashtags).
 *
 * Endpoint: https://models.github.ai/inference/embeddings (OpenAI-compatible).
 * Model: openai/text-embedding-3-small (1536 dim) — eficient și suficient pt similarity.
 *
 * pgvector format: literal `[v1,v2,...]` text se cast-uiește implicit la `vector` la INSERT/UPDATE.
 */

const DEFAULT_ENDPOINT =
  process.env.GITHUB_MODELS_EMBEDDINGS_ENDPOINT ||
  "https://models.github.ai/inference/embeddings";

const DEFAULT_MODEL =
  process.env.GITHUB_MODELS_EMBEDDING_MODEL || "openai/text-embedding-3-small";

export const EMBEDDING_DIM = 1536;

export class EmbeddingError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "EmbeddingError";
    this.status = status;
  }
}

export async function embed(text: string): Promise<number[]> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_PAT;
  if (!token) throw new EmbeddingError("GITHUB_TOKEN missing");

  const input = String(text || "").slice(0, 8000).trim();
  if (!input) throw new EmbeddingError("empty input");

  const res = await fetch(DEFAULT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input, model: DEFAULT_MODEL }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new EmbeddingError(`Embed ${res.status}: ${body.slice(0, 200)}`, res.status);
  }

  const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const vec = json.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) {
    throw new EmbeddingError(`Unexpected embedding shape len=${vec?.length}`);
  }
  return vec;
}

/** Conversie array → literal pgvector (`[1,2,3]`). */
export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}
