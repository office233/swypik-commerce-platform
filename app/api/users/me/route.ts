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
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-z0-9_]+$/;

type Body = {
  display_name?: unknown;
  bio?: unknown;
  username?: unknown;
};

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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: { col: string; val: string | null }[] = [];

  if (body.display_name !== undefined) {
    if (typeof body.display_name !== "string") {
      return NextResponse.json({ error: "display_name trebuie să fie text" }, { status: 400 });
    }
    const v = body.display_name.trim();
    if (v.length < 1 || v.length > 50) {
      return NextResponse.json(
        { error: "display_name trebuie să aibă între 1 și 50 de caractere" },
        { status: 400 }
      );
    }
    const dnText = typeof v === "string" ? v : "";
    if (dnText.length > 0) {
      const mDn = moderateText(dnText, "display_name");
      if (mDn.action !== "allow") {
        return NextResponse.json(
          { error: mDn.message ?? "Nume respins de moderare.", reasons: mDn.reasons },
          { status: 422 },
        );
      }
    }
    updates.push({ col: "display_name", val: v });
  }

  if (body.bio !== undefined) {
    if (body.bio !== null && typeof body.bio !== "string") {
      return NextResponse.json({ error: "bio trebuie să fie text" }, { status: 400 });
    }
    const raw = (body.bio as string | null) ?? "";
    const v = typeof raw === "string" ? raw : "";
    if (v.length > 300) {
      return NextResponse.json(
        { error: "bio nu poate depăși 300 de caractere" },
        { status: 400 }
      );
    }
    if (v.length > 0) {
      const m = moderateText(v, "bio");
      if (m.action !== "allow") {
        return NextResponse.json(
          { error: m.message ?? "Bio respins de moderare.", reasons: m.reasons },
          { status: 422 },
        );
      }
    }
    updates.push({ col: "bio", val: v.length === 0 ? null : v });
  }

  if (body.username !== undefined) {
    if (typeof body.username !== "string") {
      return NextResponse.json({ error: "username trebuie să fie text" }, { status: 400 });
    }
    const v = body.username.trim().toLowerCase();
    if (v.length < 3 || v.length > 30) {
      return NextResponse.json(
        { error: "username trebuie să aibă între 3 și 30 de caractere" },
        { status: 400 }
      );
    }
    if (!USERNAME_RE.test(v)) {
      return NextResponse.json(
        { error: "username poate conține doar litere mici, cifre și underscore" },
        { status: 400 }
      );
    }

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
