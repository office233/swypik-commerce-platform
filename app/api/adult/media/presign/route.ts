/**
 * Adult media presign endpoint.
 *
 * Requires: caller is an approved adult creator (adult.creator_kyc.status='approved').
 * Returns: { url, method:'PUT', headers, key, publicUrl }.
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { adultQuery } from "@/lib/adult/db";
import { presignAdultUpload, adultStorageConfigured } from "@/lib/adult/storage";
import { writeAuditFromRequest } from "@/lib/adult/audit";

export const dynamic = "force-dynamic";

interface Body {
  postKind?: string;
  variant?: string;
  contentType?: string;
  contentLength?: number;
}

const KINDS = new Set(["photo_set", "video", "live", "ppv", "drop", "bundle"]);
const VARIANTS = new Set(["preview", "premium"]);

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!adultStorageConfigured()) {
    return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });
  }

  const { rows } = await adultQuery<{ status: string }>(
    `SELECT status FROM adult.creator_kyc WHERE user_id = $1`, [user.userId],
  );
  if (rows[0]?.status !== "approved") {
    return NextResponse.json({ error: "creator_not_approved", status: rows[0]?.status ?? "none" }, { status: 403 });
  }

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  if (!body.postKind || !KINDS.has(body.postKind)) {
    return NextResponse.json({ error: "bad_postKind" }, { status: 400 });
  }
  if (!body.variant || !VARIANTS.has(body.variant)) {
    return NextResponse.json({ error: "bad_variant" }, { status: 400 });
  }
  if (!body.contentType || !body.contentLength || body.contentLength <= 0) {
    return NextResponse.json({ error: "bad_size_or_type" }, { status: 400 });
  }

  try {
    const out = await presignAdultUpload({
      creatorUserId: user.userId,
      postKind: body.postKind as any,
      variant: body.variant as any,
      contentType: body.contentType,
      contentLength: body.contentLength,
    });

    await writeAuditFromRequest({
      actorUserId: user.userId,
      action: "media.presign",
      targetType: "media_key",
      targetId: out.key,
      afterState: { postKind: body.postKind, variant: body.variant, contentType: body.contentType, contentLength: body.contentLength },
    }).catch(() => {});

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: "presign_failed", message: String(e?.message || e) }, { status: 400 });
  }
}
