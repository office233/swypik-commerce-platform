/**
 * GET /api/missions — misiunile deschise (active, finanțate, RON), public.
 */
import { NextResponse } from "next/server";
import { listOpenMissions } from "@/lib/missions/repo";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") || 20);
  try {
    const missions = await listOpenMissions(limit);
    return NextResponse.json(
      { missions },
      { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (err) {
    logger.error({ err }, "[api/missions] GET failed");
    return NextResponse.json({ error: "internal_error", missions: [] }, { status: 500 });
  }
}
