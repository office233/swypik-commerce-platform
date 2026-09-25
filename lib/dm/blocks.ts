/** Blocări între utilizatori (tabela user_blocks, migrarea 0080). */
import { dbQuery } from "@/lib/db";

export type BlockState = { blockedByMe: boolean; blockedMe: boolean };

/** Starea de blocare între viewer și peer, în ambele sensuri. */
export async function getBlockState(viewerId: string, peerId: string): Promise<BlockState> {
  const { rows } = await dbQuery<{ blocker_user_id: string }>(
    `SELECT blocker_user_id FROM user_blocks
      WHERE (blocker_user_id = $1 AND blocked_user_id = $2)
         OR (blocker_user_id = $2 AND blocked_user_id = $1)`,
    [viewerId, peerId],
  );
  return {
    blockedByMe: rows.some((r) => r.blocker_user_id === viewerId),
    blockedMe: rows.some((r) => r.blocker_user_id === peerId),
  };
}

/** true dacă oricare dintre cei doi l-a blocat pe celălalt. */
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const s = await getBlockState(a, b);
  return s.blockedByMe || s.blockedMe;
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await dbQuery(
    `INSERT INTO user_blocks (blocker_user_id, blocked_user_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [blockerId, blockedId],
  );
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await dbQuery(`DELETE FROM user_blocks WHERE blocker_user_id = $1 AND blocked_user_id = $2`, [blockerId, blockedId]);
}

export async function userExists(userId: string): Promise<boolean> {
  const { rows } = await dbQuery(`SELECT 1 FROM users WHERE id = $1 LIMIT 1`, [userId]);
  return rows.length > 0;
}
