/**
 * PATCH /api/users/me — update the current user's profile.
 *
 * Auth-gated via the canonical session resolver (`getAuthSession`).
 * Accepts a JSON body with any subset of `display_name`, `bio`, `username`.
 * Validates lengths/format, enforces username uniqueness, and rate-limits to
 * 5 updates per 10 minutes per user.
 */

import { NextResponse } from "next/server";
import { moderateText } from "@/lib/moderation/moderateText";
import { recordStrike } from "@/lib/moderation/strikes";
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { UserProfilePatchSchema, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  email: string | null;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

export async function PATCH(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { success } = await rateLimit("profile_edit", session.userId, {
    limit: 5,
    window: 600,
  });
  if (!success) {
    return NextResponse.json(
      { error: "Prea multe modificări. Încearcă din nou peste câteva minute." },
      { status: 429 }
    );
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = parseBody(UserProfilePatchSchema, rawBody);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.data;

  const updates: { col: string; val: string | null }[] = [];

  if (body.display_name !== undefined) {
    const v = body.display_name;
    const mDn = moderateText(v, "display_name");
    if (mDn.action !== "allow") {
      void recordStrike({
        userId: session.userId,
        label: mDn.label === "blocked" ? "blocked" : mDn.label === "adult" ? "adult" : "sensitive",
        context: "display_name",
        reason: mDn.message,
        reasons: mDn.reasons,
        signals: mDn.signals as Record<string, unknown>,
      });
      return NextResponse.json(
        { error: mDn.message ?? "Nume respins de moderare.", reasons: mDn.reasons },
        { status: 422 },
      );
    }
    updates.push({ col: "display_name", val: v });
  }

  if (body.bio !== undefined) {
    const v = body.bio ?? "";
    if (v.length > 0) {
      const m = moderateText(v, "bio");
      if (m.action !== "allow") {
        void recordStrike({
          userId: session.userId,
          label: m.label === "blocked" ? "blocked" : m.label === "adult" ? "adult" : "sensitive",
          context: "bio",
          reason: m.message,
          reasons: m.reasons,
          signals: m.signals as Record<string, unknown>,
        });
        return NextResponse.json(
          { error: m.message ?? "Bio respins de moderare.", reasons: m.reasons },
          { status: 422 },
        );
      }
    }
    updates.push({ col: "bio", val: v.length === 0 ? null : v });
  }

  if (body.username !== undefined) {
    const v = body.username;
    // Uniqueness check (case-insensitive), excluding self.
    const { rows: clash } = await dbQuery<{ id: string }>(
      `SELECT id FROM users WHERE lower(username) = lower($1) AND id <> $2 LIMIT 1`,
      [v, session.userId]
    );
    if (clash.length > 0) {
      return NextResponse.json(
        { error: "Acest username este deja folosit" },
        { status: 409 }
      );
    }
    updates.push({ col: "username", val: v });
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nimic de actualizat" }, { status: 400 });
  }

  const setSql = updates.map((u, i) => `${u.col} = $${i + 1}`).join(", ");
  const params: (string | null)[] = updates.map((u) => u.val);
  params.push(session.userId);

  try {
    const { rows } = await dbQuery<UserRow>(
      `UPDATE users
       SET ${setSql}
       WHERE id = $${updates.length + 1}
       RETURNING id, email, username, display_name, bio, avatar_url`,
      params
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ user: rows[0] });
  } catch (err: unknown) {
    // Unique constraint race condition fallback.
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      return NextResponse.json(
        { error: "Acest username este deja folosit" },
        { status: 409 }
      );
    }
    console.error("[users/me PATCH]", err);
    return NextResponse.json(
      { error: "Eroare la actualizarea profilului" },
      { status: 500 }
    );
  }
}
