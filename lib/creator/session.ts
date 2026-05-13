import crypto from "crypto";
import { cookies } from "next/headers";
import { dbQuery } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function getCreatorUserId(): Promise<string | null> {
  const store = await cookies();
  const sessionToken = store.get("swypik_session")?.value;

  if (sessionToken) {
    const { rows } = await dbQuery<{ user_id: string }>(
      `SELECT user_id
       FROM user_sessions
       WHERE session_token_hash = $1
         AND expires_at > now()
         AND revoked_at IS NULL
       LIMIT 1`,
      [hashToken(sessionToken)],
    );
    if (rows[0]?.user_id) return rows[0].user_id;
  }

  const legacyCreatorId = store.get("creator_session")?.value;
  if (process.env.NODE_ENV !== "production" && legacyCreatorId && UUID_RE.test(legacyCreatorId)) {
    return legacyCreatorId;
  }

  return null;
}
