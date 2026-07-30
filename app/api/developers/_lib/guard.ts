/**
 * Guard comun pentru portalul /developers: cere user logat + cont dev aprobat.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthUser } from "@/lib/auth/getAuthUser";

export interface DeveloperAccount {
  id: string;
  user_id: string;
  status: string;
}

export type DeveloperGuard =
  | { ok: true; developer: DeveloperAccount }
  | { ok: false; response: NextResponse };

export async function requireApprovedDeveloper(): Promise<DeveloperGuard> {
  const user = await getAuthUser();
  if (!user.userId) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const { rows } = await dbQuery<DeveloperAccount>(
    `SELECT id, user_id, status FROM developer_accounts WHERE user_id = $1 LIMIT 1`,
    [user.userId],
  );
  if (rows.length === 0) {
    return { ok: false, response: NextResponse.json({ error: "not_a_developer" }, { status: 403 }) };
  }
  if (rows[0].status !== "approved") {
    return {
      ok: false,
      response: NextResponse.json({ error: "developer_not_approved", status: rows[0].status }, { status: 403 }),
    };
  }
  return { ok: true, developer: rows[0] };
}
