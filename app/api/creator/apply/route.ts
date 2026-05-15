import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getCreatorUserId } from "@/lib/creator/session";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const HANDLE_RE = /^[a-z0-9_.-]{3,32}$/i;

type ApplyBody = {
  requested_handle?: string;
  category?: string;
  website_url?: string;
  social_links?: Record<string, string>;
};

/**
 * POST /api/creator/apply
 *
 * Submits a creator application for the authenticated user. The application
 * is stored in `creator_applications` with status `submitted` and DOES NOT
 * promote the user's role. Promotion happens via a separate admin-approved
 * flow that updates `users.role = 'creator'` after reviewing the application.
 *
 * Idempotency: if the user already has a pending (`submitted`/`in_review`)
 * application, the existing one is returned. Users who are already
 * `creator`/`admin` get a no-op success response.
 */
export async function POST(req: Request) {
  try {
    const userId = await getCreatorUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: ApplyBody = {};
    try {
      const text = await req.text();
      body = text ? (JSON.parse(text) as ApplyBody) : {};
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { rows: userRows } = await dbQuery<{
      role: string;
      username: string | null;
    }>(
      `SELECT role, username FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const user = userRows[0];
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (user.role === "admin" || user.role === "creator") {
      return NextResponse.json({
        success: true,
        role: user.role,
        alreadyCreator: true,
      });
    }
    if (user.role !== "shopper") {
      return NextResponse.json(
        { error: "Cannot apply with this role" },
        { status: 403 },
      );
    }

    // Validate handle (fall back to username when not supplied).
    const requestedHandleRaw =
      typeof body.requested_handle === "string" && body.requested_handle.trim()
        ? body.requested_handle.trim()
        : user.username || "";
    if (!requestedHandleRaw || !HANDLE_RE.test(requestedHandleRaw)) {
      return NextResponse.json(
        {
          error:
            "Invalid requested_handle (3-32 chars, alphanumeric/._- only)",
        },
        { status: 400 },
      );
    }

    const category =
      typeof body.category === "string"
        ? body.category.trim().slice(0, 64) || null
        : null;
    const websiteUrl =
      typeof body.website_url === "string"
        ? body.website_url.trim().slice(0, 500) || null
        : null;
    const socialLinks =
      body.social_links && typeof body.social_links === "object"
        ? body.social_links
        : {};

    // Reuse existing pending application if present.
    const { rows: existing } = await dbQuery<{
      id: string;
      status: string;
    }>(
      `SELECT id, status
       FROM creator_applications
       WHERE user_id = $1
         AND status IN ('submitted', 'in_review')
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );
    if (existing[0]) {
      return NextResponse.json({
        success: true,
        application: existing[0],
        pending: true,
      });
    }

    const { rows: inserted } = await dbQuery<{ id: string; status: string }>(
      `INSERT INTO creator_applications
         (user_id, requested_handle, category, website_url, social_links)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id, status`,
      [
        userId,
        requestedHandleRaw,
        category,
        websiteUrl,
        JSON.stringify(socialLinks),
      ],
    );

    return NextResponse.json({
      success: true,
      application: inserted[0],
      pending: true,
    });
  } catch (err) {
    logger.error({ err }, "[creator/apply] error");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
