/**
 * GET/PUT /api/creator/videos/[id]/product-tags
 *
 * Tag-uri de produse pe clip, cu timestamp pentru overlay-ul
 * "vezi produsul" din player. Foloseste tabela EXISTENTA
 * video_product_links (placement='overlay', start_ms/end_ms) —
 * nu exista o tabela separata video_product_tags.
 *
 * PUT inlocuieste atomic setul de tag-uri overlay al clipului
 * (max 10), doar pentru clipul creatorului autenticat.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery, getDb } from "@/lib/db";
import { getCreatorUserId } from "@/lib/creator/session";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TagSchema = z.object({
    product_id: z.string().regex(UUID_RE, "product_id must be a UUID"),
    start_ms: z.number().int().min(0),
    end_ms: z.number().int().min(0).nullable().optional(),
    label: z.string().max(120).optional(),
});

const PutSchema = z.object({
    tags: z.array(TagSchema).max(10),
});

async function assertOwnership(videoId: string, creatorId: string): Promise<boolean> {
    const { rows } = await dbQuery<{ id: string }>(
        `SELECT id FROM videos WHERE id = $1 AND creator_id = $2 LIMIT 1`,
        [videoId, creatorId]
    );
    return rows.length > 0;
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const creatorId = await getCreatorUserId();
        if (!creatorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
        if (!(await assertOwnership(id, creatorId))) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const { rows } = await dbQuery(
            `SELECT vpl.product_id, vpl.start_ms, vpl.end_ms, vpl.sort_order,
              vpl.metadata->>'label' AS label,
              p.title, p.image_url, p.price_cents, p.currency
         FROM video_product_links vpl
         JOIN marketplace_products p ON p.id = vpl.product_id
        WHERE vpl.video_id = $1 AND vpl.placement = 'overlay'
        ORDER BY vpl.sort_order ASC, vpl.created_at ASC`,
            [id]
        );
        return NextResponse.json({ tags: rows });
    } catch (e) {
        logger.error({ err: e }, "product-tags GET failed");
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const creatorId = await getCreatorUserId();
        if (!creatorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const rl = await rateLimit("uploadSession", creatorId);
        if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

        const { id } = await params;
        if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
        if (!(await assertOwnership(id, creatorId))) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const body = await req.json().catch(() => null);
        const parsed = PutSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "validation", details: parsed.error.flatten() },
                { status: 400 }
            );
        }
        for (const tag of parsed.data.tags) {
            if (tag.end_ms != null && tag.end_ms < tag.start_ms) {
                return NextResponse.json({ error: "end_ms must be >= start_ms" }, { status: 400 });
            }
        }

        const client = await getDb().connect();
        try {
            await client.query("BEGIN");
            await client.query(
                `DELETE FROM video_product_links WHERE video_id = $1 AND placement = 'overlay'`,
                [id]
            );
            for (let i = 0; i < parsed.data.tags.length; i++) {
                const tag = parsed.data.tags[i];
                await client.query(
                    `INSERT INTO video_product_links
             (video_id, product_id, placement, start_ms, end_ms, sort_order, metadata)
           VALUES ($1, $2, 'overlay', $3, $4, $5, $6::jsonb)
           ON CONFLICT DO NOTHING`,
                    [id, tag.product_id, tag.start_ms, tag.end_ms ?? null, i,
                        JSON.stringify(tag.label ? { label: tag.label } : {})]
                );
            }
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK").catch(() => { });
            throw e;
        } finally {
            client.release();
        }

        logger.info({ videoId: id, creatorId, count: parsed.data.tags.length }, "video product tags updated");
        return NextResponse.json({ ok: true, count: parsed.data.tags.length });
    } catch (e) {
        logger.error({ err: e }, "product-tags PUT failed");
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
