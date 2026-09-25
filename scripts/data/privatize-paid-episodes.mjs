#!/usr/bin/env node
/**
 * Mută media episoadelor PLĂTITE (episode_number > free_episodes) în prefixul
 * privat al bucket-ului (`MEDIA_PRIVATE_PREFIX`, implicit `private/`), unde nu
 * există acces anonim, și actualizează `videos.playback_url`. După asta,
 * episoadele plătite se pot reda DOAR prin /api/movies/stream/<token>/…
 * (proxy-ul citește prin GET presemnat).
 *
 * Pași (rulat de owner, în containerul web-next sau cu aceleași env-uri):
 *   1. dry-run:  node scripts/data/privatize-paid-episodes.mjs
 *   2. copiere:  node scripts/data/privatize-paid-episodes.mjs --apply
 *   3. verifică redarea unui episod plătit, APOI șterge copiile publice:
 *               node scripts/data/privatize-paid-episodes.mjs --apply --delete-public
 * Politica bucket-ului (MinIO): acces anonim doar pe prefixele publice, NU pe `private/`
 *   (ex. `mc anonymous set none <alias>/<bucket>/private`).
 *
 * Env: DATABASE_URL, S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, MEDIA_PUBLIC_BASE_URL (alias vechi: S3_PUBLIC_URL).
 */
import pg from "pg";
import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const env = (...keys) => keys.map((k) => process.env[k]?.trim()).find(Boolean) ?? "";
const BUCKET = env("S3_BUCKET", "S3_MEDIA_BUCKET", "R2_BUCKET");
const PUBLIC_BASE = (env("MEDIA_PUBLIC_BASE_URL", "S3_PUBLIC_URL", "S3_PUBLIC_BASE_URL", "R2_PUBLIC_URL") || `${env("S3_ENDPOINT", "R2_ENDPOINT")}/${BUCKET}`).replace(/\/$/, "");
const PRIVATE_PREFIX = (env("MEDIA_PRIVATE_PREFIX") || "private/").replace(/\/?$/, "/");

const apply = process.argv.includes("--apply");
const deletePublic = process.argv.includes("--delete-public");

const s3 = new S3Client({
    region: env("S3_REGION", "R2_REGION") || "auto",
    endpoint: env("S3_ENDPOINT", "R2_ENDPOINT"),
    credentials: { accessKeyId: env("S3_ACCESS_KEY", "S3_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID"), secretAccessKey: env("S3_SECRET_KEY", "S3_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY") },
    forcePathStyle: true,
});

async function listKeys(prefix) {
    const keys = [];
    let token;
    do {
        const out = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }));
        for (const o of out.Contents ?? []) if (o.Key) keys.push(o.Key);
        token = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (token);
    return keys;
}

async function main() {
    if (!BUCKET || !PUBLIC_BASE) throw new Error("S3_BUCKET / S3_PUBLIC_URL lipsă");
    const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const { rows } = await db.query(
        `SELECT v.id AS video_id, v.playback_url
           FROM movie_episodes e JOIN movie_series s ON s.id = e.series_id JOIN videos v ON v.id = e.video_id
          WHERE e.episode_number > s.free_episodes AND v.playback_url IS NOT NULL`,
    );
    for (const r of rows) {
        if (!r.playback_url.startsWith(`${PUBLIC_BASE}/`)) { console.log(`- ${r.video_id}: în afara bucket-ului, sărit`); continue; }
        const key = r.playback_url.slice(PUBLIC_BASE.length + 1);
        const dir = key.slice(0, key.lastIndexOf("/") + 1);
        if (key.startsWith(PRIVATE_PREFIX)) {
            if (deletePublic && apply) {
                const publicDir = dir.slice(PRIVATE_PREFIX.length);
                for (const k of await listKeys(publicDir)) await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: k }));
                console.log(`✓ ${r.video_id}: copii publice șterse (${publicDir})`);
            } else console.log(`= ${r.video_id}: deja privat`);
            continue;
        }
        const objects = await listKeys(dir);
        console.log(`${apply ? "→" : "[dry-run]"} ${r.video_id}: ${objects.length} obiecte ${dir} → ${PRIVATE_PREFIX}${dir}`);
        if (!apply) continue;
        for (const k of objects) {
            await s3.send(new CopyObjectCommand({ Bucket: BUCKET, CopySource: `${BUCKET}/${encodeURI(k)}`, Key: `${PRIVATE_PREFIX}${k}` }));
        }
        await db.query(`UPDATE videos SET playback_url = $2, updated_at = now() WHERE id = $1`, [r.video_id, `${PUBLIC_BASE}/${PRIVATE_PREFIX}${key}`]);
    }
    await db.end();
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
