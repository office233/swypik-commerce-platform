/**
 * POST /api/users/me/avatar — upload a new avatar for the current user.
 *
 * Accepts multipart/form-data with field `avatar` (jpg/png/webp, max 5MB).
 * Stores under `avatars/{userId}/{uuid}.{ext}` in R2 via the shared
 * `uploadFile` helper, then writes `users.avatar_url`.
 * Rate-limited to 3 uploads/hour per user.
 */

import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { uploadFile, MAX_FILE_SIZE } from "@/lib/storage/upload";

export const dynamic = "force-dynamic";

const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { success } = await rateLimit("avatar_upload", session.userId, {
    limit: 3,
    window: 3600,
  });
  if (!success) {
    return NextResponse.json(
      { error: "Prea multe încărcări. Încearcă din nou peste o oră." },
      { status: 429 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const fileField = form.get("avatar");
  if (!(fileField instanceof File)) {
    return NextResponse.json(
      { error: "Câmpul `avatar` este obligatoriu" },
      { status: 400 }
    );
  }

  if (!ALLOWED_AVATAR_TYPES.has(fileField.type)) {
    return NextResponse.json(
      { error: "Tip de imagine nepermis. Folosește JPG, PNG sau WebP." },
      { status: 400 }
    );
  }

  if (fileField.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `Imaginea depășește limita de ${MAX_FILE_SIZE / (1024 * 1024)}MB.` },
      { status: 400 }
    );
  }

  if (fileField.size === 0) {
    return NextResponse.json({ error: "Fișier gol" }, { status: 400 });
  }

  const buffer = Buffer.from(await fileField.arrayBuffer());

  try {
    const result = await uploadFile(buffer, fileField.name || "avatar", fileField.type, {
      keyPrefix: `avatars/${session.userId}`,
    });

    await dbQuery(
      `UPDATE users SET avatar_url = $1 WHERE id = $2`,
      [result.url, session.userId]
    );

    return NextResponse.json({ avatar_url: result.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Eroare la încărcare";
    console.error("[users/me/avatar POST]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
