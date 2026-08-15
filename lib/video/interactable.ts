import type { PoolClient } from "pg";
import { dbQuery } from "@/lib/db";

/**
 * P2-01: un video pe care nu îl mai poate vedea nimeni (ascuns de moderare,
 * privat, șters sau încă în procesare) nu trebuie să mai primească engagement
 * nou. Fără verificarea asta, oricine deține UUID-ul putea umfla `like_count`
 * / `save_count` pe conținut retras și injecta `feed_events` în semnalele de
 * ranking.
 *
 * Coloanele sunt cele care există REAL pe `videos` (db/schema.sql):
 *   - status      ∈ uploading|processing|ready|failed|archived|deleted
 *   - visibility  ∈ draft|unlisted|public|private
 *   - is_hidden   boolean (ascundere din moderare)
 * `effective_label` NU e o coloană pe `videos` — e derivată într-o view din
 * `video_safety_labels`, deci nu poate fi filtrată aici.
 *
 * IMPORTANT: se aplică doar la ADĂUGAREA de engagement. Retragerea (unlike /
 * unsave) rămâne mereu permisă, altfel un utilizator ar rămâne blocat cu un
 * like pe un video care între timp a devenit privat.
 */
const INTERACTABLE_SQL = `SELECT 1 FROM videos
   WHERE id = $1
     AND status = 'ready'
     AND is_hidden = false
     AND visibility IN ('public', 'unlisted')`;

/** Varianta pe o conexiune/tranzacție existentă. */
export async function isVideoInteractableTx(
  client: PoolClient,
  videoId: string,
): Promise<boolean> {
  const { rows } = await client.query(INTERACTABLE_SQL, [videoId]);
  return rows.length > 0;
}

/** Varianta pe pool (fără tranzacție deschisă). */
export async function isVideoInteractable(videoId: string): Promise<boolean> {
  const { rows } = await dbQuery(INTERACTABLE_SQL, [videoId]);
  return rows.length > 0;
}
