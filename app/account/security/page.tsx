import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";
import SecurityPageClient from "./SecurityPageClient";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/auth/login?next=/account/security");
  }

  const { rows } = await dbQuery<{ has_password: boolean }>(
    `SELECT (password_hash IS NOT NULL) AS has_password
     FROM users WHERE id = $1`,
    [session.userId],
  );
  const hasPassword = Boolean(rows[0]?.has_password);

  return <SecurityPageClient hasPassword={hasPassword} />;
}
