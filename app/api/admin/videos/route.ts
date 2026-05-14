import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

import { requireAuth } from "@/lib/auth/getAuthUser";
import { notifyVideoApproved, notifyVideoRejected } from "@/lib/email/creator-notifications";
import { enqueueAeVideoPipeline } from "@/lib/video/ae-pipeline";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/videos — list all video assets for admin review.
 *
 * Schema (migration 0001):
 *   video_assets: video_id, asset_type, object_key, status, duration_ms, width, height
 *   videos:       creator_id, title, description, product_refs, status
 *   video_processing_jobs: video_id, asset_id, status, attempt_count, error_message
 */
export async function GET(req: Request) {
  const __auth = await requireAuth(req, ["admin"]);
  if (__auth instanceof NextResponse) return __auth;

  try {
    const publicUrl = process.env.S3_PUBLIC_URL?.replace(/\/$/, "") || "";
    const { rows } = await dbQuery(`
      SELECT 
        va.id,
        va.asset_type,
        va.object_key,
        va.public_url,
        va.status,
        va.duration_ms,
        va.width,
        va.height,
        va.metadata  AS asset_metadata,
        va.created_at,
        v.id          AS video_id,
        v.title       AS video_title,
        v.description AS video_description,
        v.status      AS video_status,
        v.product_refs,
        u.display_name AS creator_name,
        u.email        AS creator_email,
        vpj.status     AS job_status,
        vpj.attempt_count AS job_attempts,
        vpj.error_message AS job_error
      FROM video_assets va
      JOIN videos v ON va.video_id = v.id
      LEFT JOIN users u ON v.creator_id = u.id
      LEFT JOIN LATERAL (
        SELECT status, attempt_count, error_message
        FROM video_processing_jobs 
        WHERE video_id = v.id
        ORDER BY created_at DESC
        LIMIT 1
      ) vpj ON true
      WHERE va.asset_type = 'source'
      ORDER BY va.created_at DESC
      LIMIT 200
    `);

    // Derive product info from videos.product_refs JSONB array
    const videos = rows.map((r: any) => {
      let productId: string | null = null;
      try {
        const refs = typeof r.product_refs === "string"
          ? JSON.parse(r.product_refs)
          : r.product_refs;
        if (Array.isArray(refs) && refs.length > 0) {
          const firstRef = refs[0];
          productId = typeof firstRef === "string"
            ? firstRef
            : firstRef?.product_id || firstRef?.id || null;
        }
      } catch { /* ignore */ }

      const assetMetadata = r.asset_metadata || {};
      const status = r.video_status === "ready" || r.status === "available" ? "ready" : r.status;

      return {
        id: r.id,
        video_id: r.video_id,
        status,
        video_status: r.video_status,
        raw_key: r.object_key,
        mp4_key: assetMetadata.mp4_key || assetMetadata.preview_key || null,
        thumbnail_key: assetMetadata.thumbnail_key || null,
        thumbnail_url: assetMetadata.thumbnail_url
          || (assetMetadata.thumbnail_key && publicUrl ? `${publicUrl}/${assetMetadata.thumbnail_key}` : null),
        hls_master_key: assetMetadata.master_key || null,
        playback_url: r.public_url,
        object_key: r.object_key,
        duration_seconds: r.duration_ms ? Math.round(r.duration_ms / 1000) : null,
        width: r.width,
        height: r.height,
        title: r.video_title,
        description: r.video_description,
        creator_name: r.creator_name,
        creator_email: r.creator_email,
        product_id: productId,
        error_message: r.job_error,
        job_status: r.job_status,
        job_attempts: r.job_attempts,
        created_at: r.created_at,
      };
    });

    return NextResponse.json({ videos });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Videos] GET error:");
    return NextResponse.json(
      { error: "Failed to fetch video assets" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const __auth = await requireAuth(req, ["admin"]);
  if (__auth instanceof NextResponse) return __auth;

  try {
    const body = await req.json();
    const { action, videoId, reason } = body;

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }
    // import_ae doesn't operate on an existing videoId; everything else does.
    if (action !== "import_ae" && !videoId) {
      return NextResponse.json(
        { error: "Missing videoId" },
        { status: 400 }
      );
    }

    switch (action) {
      case "approve": {
        // Approve both video_assets source and the parent video
        await dbQuery(
          `UPDATE video_assets SET status = 'available' WHERE id = $1`,
          [videoId]
        );
        // Also set parent video to ready + public
        await dbQuery(
          `UPDATE videos SET status = 'ready', visibility = 'public', published_at = NOW()
           WHERE id = (SELECT video_id FROM video_assets WHERE id = $1)`,
          [videoId]
        );

        // Fire-and-forget creator email notification
        dbQuery(
          `SELECT u.email, u.display_name, v.title
           FROM video_assets va
           JOIN videos v ON va.video_id = v.id
           JOIN users u ON v.creator_id = u.id
           WHERE va.id = $1`,
          [videoId]
        )
          .then(({ rows }) => {
            if (rows[0]?.email) {
              notifyVideoApproved(
                rows[0].email,
                rows[0].display_name || "Creator",
                rows[0].title || "Untitled",
              ).catch(console.error);
            }
          })
          .catch(console.error);

        return NextResponse.json({ success: true, message: "Video approved" });
      }

      case "reject": {
        const rejectReason = reason || "Rejected by admin";
        await dbQuery(
          `UPDATE video_assets SET status = 'failed' WHERE id = $1`,
          [videoId]
        );
        await dbQuery(
          `UPDATE videos SET status = 'failed'
           WHERE id = (SELECT video_id FROM video_assets WHERE id = $1)`,
          [videoId]
        );
        // Store rejection reason in processing job
        await dbQuery(
          `INSERT INTO video_processing_jobs (video_id, asset_id, job_type, status, error_message)
           VALUES ((SELECT video_id FROM video_assets WHERE id = $1), $1, 'moderation', 'failed', $2)`,
          [videoId, rejectReason]
        );

        // Fire-and-forget creator email notification
        dbQuery(
          `SELECT u.email, u.display_name, v.title
           FROM video_assets va
           JOIN videos v ON va.video_id = v.id
           JOIN users u ON v.creator_id = u.id
           WHERE va.id = $1`,
          [videoId]
        )
          .then(({ rows }) => {
            if (rows[0]?.email) {
              notifyVideoRejected(
                rows[0].email,
                rows[0].display_name || "Creator",
                rows[0].title || "Untitled",
                rejectReason,
              ).catch(console.error);
            }
          })
          .catch(console.error);

        return NextResponse.json({ success: true, message: "Video rejected" });
      }

      case "reprocess": {
        // Use correct column name: asset_id, not video_asset_id
        await dbQuery(
          `INSERT INTO video_processing_jobs (video_id, asset_id, job_type, status, priority)
           VALUES ((SELECT video_id FROM video_assets WHERE id = $1), $1, 'transcode', 'queued', 100)`,
          [videoId]
        );
        return NextResponse.json({ success: true, message: "Reprocessing queued" });
      }

      case "import_ae": {
        // Route a NEW AliExpress video through the hybrid pipeline:
        // (no direct DB INSERT of playback_url='https://video.aliexpress-media...').
        // The body for this action carries the AE payload — `videoId` is unused.
        const sourceUrl: string | undefined = body.sourceUrl || body.source_url || body.video_url;
        if (!sourceUrl) {
          return NextResponse.json(
            { error: "import_ae requires sourceUrl" },
            { status: 400 }
          );
        }

        const result = await enqueueAeVideoPipeline({
          sourceUrl,
          title: body.title,
          description: body.description,
          productRefs: Array.isArray(body.productRefs) ? body.productRefs : undefined,
          tags: Array.isArray(body.tags) ? body.tags : undefined,
          metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
        });

        return NextResponse.json(
          {
            success: true,
            message: "AE video import queued",
            ...result,
          },
          { status: 202 }
        );
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Videos] POST error:");
    return NextResponse.json(
      { error: "Action failed" },
      { status: 500 }
    );
  }
}
