import { NextResponse } from "next/server";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { rateLimit } from "@/lib/security/rate-limit";
import { uploadFile, isStorageConfigured } from "@/lib/storage/upload";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    if (!isStorageConfigured()) {
      return NextResponse.json({ success: false, error: "Storage neconfigurat." }, { status: 503 });
    }

    const rl = await rateLimit("sellerUploadImage", sellerId, { limit: 60, window: 300 });
    if (!rl.success) return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ success: false, error: "Lipsește fișierul." }, { status: 400 });
    }
    const mimeType = file.type || "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());
    const name = (form?.get("filename") as string) || "image";

    const result = await uploadFile(buffer, name, mimeType, {
      keyPrefix: `products/seller/${sellerId}/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    });

    return NextResponse.json({ success: true, url: result.url, key: result.key, size: result.size });
  } catch (error: any) {
    logger.warn({ err: error?.message }, "[seller/upload-image] error");
    return NextResponse.json({ success: false, error: error?.message || "Upload eșuat." }, { status: 400 });
  }
}
