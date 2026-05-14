import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getCreatorUserId } from "@/lib/creator/session";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const creatorId = await getCreatorUserId();
    if (!creatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = (formData.get("file") || formData.get("video")) as File;
    const productId = formData.get("productId") as string;
    const description = formData.get("description") as string;

    if (!file || !productId) {
      return NextResponse.json(
        { error: "Missing file or productId" },
        { status: 400 }
      );
    }

    const goApiBaseUrl = getPlatformApiBaseURL();
    const initRes = await fetch(`${goApiBaseUrl}/v1/videos/uploads/init`, {
      method: "POST",
      headers: platformApiHeaders(),
      body: JSON.stringify({
        creator_id: creatorId,
        product_id: productId,
        filename: file.name,
        content_type: file.type || "video/mp4",
        size_bytes: file.size,
      }),
    });
    const initData = await initRes.json().catch(() => ({}));

    if (!initRes.ok) {
      logger.error({ err: initData }, "GO API init error:");
      return NextResponse.json(
        { error: initData?.error?.message || initData?.error || "Failed to initialize video upload" },
        { status: initRes.status }
      );
    }

    const uploadHeaders = new Headers(initData.headers || {});
    if (!uploadHeaders.has("Content-Type")) {
      uploadHeaders.set("Content-Type", file.type || "video/mp4");
    }

    const uploadRes = await fetch(String(initData.upload_url), {
      method: String(initData.method || "PUT"),
      headers: uploadHeaders,
      body: file,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => "");
      logger.error({ err: text }, "R2 upload error:");
      return NextResponse.json(
        { error: "Failed to upload video to media storage" },
        { status: 502 }
      );
    }

    const completeRes = await fetch(`${goApiBaseUrl}/v1/videos/uploads/complete`, {
      method: "POST",
      headers: platformApiHeaders(),
      body: JSON.stringify({
        upload_id: initData.upload_id,
        creator_id: creatorId,
      }),
    });
    const completeData = await completeRes.json().catch(() => ({}));

    if (!completeRes.ok) {
      logger.error({ err: completeData }, "GO API complete error:");
      return NextResponse.json(
        { error: completeData?.error?.message || completeData?.error || "Failed to complete video upload" },
        { status: completeRes.status }
      );
    }

    const localId = completeData.video_id || completeData.id || crypto.randomUUID();
    const videoUrl = completeData.video_url || completeData.playback_url || "";

    await dbQuery(
      `
      INSERT INTO creator_videos (id, creator_id, product_id, video_url, description, status)
      VALUES ($1, $2, $3, $4, $5, 'processing')
    `,
      [localId, creatorId, productId, videoUrl, description || ""]
    );

    return NextResponse.json({ success: true, id: localId, video: completeData });
  } catch (error: any) {
    logger.error({ err: error }, "Creator Video Upload Error:");
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

function getPlatformApiBaseURL(): string {
  const raw = process.env.GO_API_URL || "http://localhost:8080";
  return raw
    .replace(/\/api\/v1\/videos\/upload\/?$/, "")
    .replace(/\/v1\/videos\/upload\/?$/, "")
    .replace(/\/+$/, "");
}

function platformApiHeaders(): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (process.env.PLATFORM_API_SECRET) {
    headers.set("X-Swypik-Internal-Secret", process.env.PLATFORM_API_SECRET);
  }
  return headers;
}
