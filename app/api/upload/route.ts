/**
 * Image Upload API
 * POST /api/upload
 *
 * Accepts multipart/form-data with a single file field named "file".
 * Validates type (JPEG/PNG/WebP/AVIF/GIF) and size (max 5MB).
 * Returns { url, key, size } on success.
 *
 * Auth: Admin or Seller session required.
 */

import { NextResponse } from "next/server";
import { uploadFile, isStorageConfigured, MAX_FILE_SIZE } from "@/lib/storage/upload";
import { isAdminRequest } from "@/lib/security/admin-auth";
import { getSellerSessionId } from "@/lib/security/seller-auth";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

const MAX_MULTIPART_OVERHEAD = 1024 * 1024;

export async function POST(req: Request) {
  // ── 1. Auth: must be admin OR seller ──
  const isAdmin = await isAdminRequest(req);
  const sellerId = await getSellerSessionId();

  if (!isAdmin && !sellerId) {
    return NextResponse.json(
      { success: false, error: "Neautorizat. Conectează-te ca admin sau seller." },
      { status: 401 }
    );
  }

  // ── 2. Check storage config ──
  if (!isStorageConfigured()) {
    return NextResponse.json(
      { success: false, error: "Storage service is not configured. Set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET." },
      { status: 503 }
    );
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_FILE_SIZE + MAX_MULTIPART_OVERHEAD) {
    return NextResponse.json(
      { success: false, error: "Fișierul depășește limita de 5MB." },
      { status: 413 }
    );
  }

  // ── 3. Parse multipart form data ──
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Niciun fișier trimis. Folosește câmpul 'file'." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    const originalName = file.name || "upload";

    // ── 4. Upload ──
    const result = await uploadFile(buffer, originalName, mimeType);

    return NextResponse.json({
      success: true,
      url: result.url,
      key: result.key,
      size: result.size,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Upload API] Error:");

    const status = error.message?.includes("nepermis") || error.message?.includes("depășește")
      ? 422
      : 500;

    return NextResponse.json(
      { success: false, error: error.message || "Eroare la upload." },
      { status }
    );
  }
}
