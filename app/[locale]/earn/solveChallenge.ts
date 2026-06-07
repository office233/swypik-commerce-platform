// Client-side TapPoW solver. Mirrors services/swypik-chain/app/mining/tappow.py.
// Runs in a Web Worker if available, otherwise inline (still <1s on most phones).

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Finds a nonce such that sha256(`${challenge}|${nonce}`) starts with `difficulty` hex zeros. */
export async function solveChallenge(challenge: string, difficulty: number): Promise<string> {
  const target = "0".repeat(difficulty);
  let nonce = 0;
  // 5 million iterations cap — at difficulty 4 (~1/65k chance) we'd average ~65k tries.
  const HARD_CAP = 5_000_000;
  while (nonce < HARD_CAP) {
    const candidate = nonce.toString(16);
    const h = await sha256Hex(`${challenge}|${candidate}`);
    if (h.startsWith(target)) return candidate;
    nonce += 1;
    // Yield to event loop every 256 attempts to keep UI responsive.
    if ((nonce & 0xff) === 0) await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error("TapPoW failed: difficulty too high");
}
