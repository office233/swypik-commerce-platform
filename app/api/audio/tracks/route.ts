import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface AudioTrackDTO {
  id: number;
  source: string;
  sourceId: string;
  title: string;
  artist: string;
  durationS: number;
  audioUrl: string;
  imageUrl: string | null;
  tags: string[];
  genre: string | null;
  attributionUrl: string | null;
  popularity: number;
}

/**
 * GET /api/audio/tracks
 *
 * Query params:
 *   q       — case-insensitive search across title/artist/tags (optional)
 *   genre   — exact genre match (optional)
 *   limit   — page size, default 20, max 100
 *   offset  — pagination offset, default 0
 *   sort    — "popular" (default) | "recent" | "duration"
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() || "";
    const genre = url.searchParams.get("genre")?.trim() || "";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
    const sort = url.searchParams.get("sort") || "popular";

    const where: string[] = ["is_active = true"];
    const params: unknown[] = [];

    if (q) {
      params.push(`%${q}%`);
      const i = params.length;
      where.push(`(title ILIKE $${i} OR artist ILIKE $${i} OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE $${i}))`);
    }
    if (genre) {
      params.push(genre);
      where.push(`genre = $${params.length}`);
    }

    const orderBy =
      sort === "recent" ? "created_at DESC" :
      sort === "duration" ? "duration_s ASC" :
      "popularity DESC, plays_count DESC";

    params.push(limit, offset);
    const sql = `
      SELECT id, source, source_id, title, artist, duration_s,
             audio_url, image_url, tags, genre, attribution_url, popularity
      FROM audio_tracks
      WHERE ${where.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const { rows } = await dbQuery<{
      id: number;
      source: string;
      source_id: string;
      title: string;
      artist: string;
      duration_s: number;
      audio_url: string;
      image_url: string | null;
      tags: string[];
      genre: string | null;
      attribution_url: string | null;
      popularity: number;
    }>(sql, params);

    const tracks: AudioTrackDTO[] = rows.map((r) => ({
      id: Number(r.id),
      source: r.source,
      sourceId: r.source_id,
      title: r.title,
      artist: r.artist,
      durationS: r.duration_s,
      audioUrl: r.audio_url,
      imageUrl: r.image_url,
      tags: r.tags ?? [],
      genre: r.genre,
      attributionUrl: r.attribution_url,
      popularity: r.popularity,
    }));

    return NextResponse.json(
      { tracks, limit, offset, hasMore: tracks.length === limit },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (err) {
    logger.error({ err }, "/api/audio/tracks failed");
    return NextResponse.json({ error: "failed to load tracks" }, { status: 500 });
  }
}