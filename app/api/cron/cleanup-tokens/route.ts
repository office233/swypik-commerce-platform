import { withErrorHandling } from "@/lib/api-handler";
import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { runCron } from "@/lib/cron/runCron";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

async function authorize(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token =
    authHeader?.replace("Bearer ", "") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("cron-secret") ||
    "";
  const expected = process.env.CRON_SECRET || "";
  if (!expected || !token) return false;
  if (Buffer.byteLength(token) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

async function GET_impl(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(
    await runCron("cleanup-tokens", async () => {
      const r1 = await dbQuery(
        "DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '7 days'"
      ).catch(() => ({ rowCount: 0 } as any));
      const r2 = await dbQuery(
        "DELETE FROM user_sessions WHERE expires_at < NOW() - INTERVAL '30 days'"
      ).catch(() => ({ rowCount: 0 } as any));
      // GDPR: IP-ul și user-agent-ul sunt date personale — le anonimizăm după
      // 90 de zile chiar dacă sesiunea încă e validă (verificare flotă/fraudă
      // are sens doar pe termen scurt).
      const r3 = await dbQuery(
        `UPDATE user_sessions SET ip_address = NULL, user_agent = NULL
          WHERE created_at < NOW() - INTERVAL '90 days'
            AND (ip_address IS NOT NULL OR user_agent IS NOT NULL)`
      ).catch(() => ({ rowCount: 0 } as any));
      return {
        tokens_deleted: r1.rowCount ?? 0,
        sessions_deleted: r2.rowCount ?? 0,
        sessions_anonymized: r3.rowCount ?? 0,
      };
    })
  );
}

export const GET = withErrorHandling(GET_impl);
