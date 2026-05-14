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

  const { rows } = await dbQuery<{ has_password: boolean; totp_enabled: boolean }>(
    `SELECT (password_hash IS NOT NULL) AS has_password,
            (totp_enabled_at IS NOT NULL) AS totp_enabled
     FROM users WHERE id = $1`,
    [session.userId],
  );
  const hasPassword = Boolean(rows[0]?.has_password);
  const totpEnabled = Boolean(rows[0]?.totp_enabled);

  return <SecurityPageClient hasPassword={hasPassword} totpEnabled={totpEnabled} />;
}
